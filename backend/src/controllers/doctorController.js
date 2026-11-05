const {pagination,pageResponse,memoryPage} = require("../utils/pagination");
const {ensurePhoneUser,validPhone,subjectId} = require("../services/phoneAuthService");
const {ethers} = require("ethers");
const {AuditChainService} = require("../services/auditChainService");
const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

function createDoctorController({ store, chain, auditChain }) {
  return {
    invite: asyncHandler(async (req,res) => {
      if (req.user.role !== "admin") return res.sendStatus(403);
      let wallet;
      if (req.body?.phone!==undefined) {
        if (!validPhone(req.body.phone)) return res.status(400).json({error:"Enter an Indian mobile number with +91"});
        wallet="user:"+(await ensurePhoneUser(store,req.body.phone)).id;
      } else if (ethers.isAddress(req.body?.wallet)) wallet=ethers.getAddress(req.body.wallet);
      else if (subjectId(req.body?.wallet)) wallet=req.body.wallet;
      else return res.status(400).json({error:"A staff mobile number is required"});
      const token = crypto.randomBytes(32).toString("hex");
      const id = crypto.randomUUID();
      const expiresAt = new Date(Date.now()+24*60*60*1000).toISOString();
      await store.transaction(async tx => {
        await tx.query("INSERT INTO staff_invitations(id,wallet,token_hash,invited_by,expires_at) VALUES ($1,$2,$3,$4,$5)",
          [id,wallet,crypto.createHash("sha256").update(token).digest("hex"),req.user.wallet,expiresAt]);
        await new AuditChainService(tx).appendAuditEvent({actor:req.user.wallet,action:"STAFF_INVITED",details:{wallet,invitationId:id}});
      });
      res.status(201).json({token,wallet,expiresAt});
    }),

    register: asyncHandler(async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const { name, licenseNumber, specialty } = req.body || {};

      if (![name,licenseNumber,specialty].every(value => typeof value === "string" && value.trim().length>0 && value.length<=200)) {
        return res
          .status(400)
          .json({ error: "name, licenseNumber and specialty are required" });
      }

      const existing = await store.providerByWallet(wallet);
      if (existing) {
        return res
          .status(409)
          .json({ error: "Provider already registered", provider: existing });
      }

      const register = async (tx, transactionAudit) => {
        if (process.env.NODE_ENV === "production" || process.env.STAFF_INVITE_ONLY === "true") {
          const token = req.body?.invitationToken;
          if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
            const error = new Error("A hospital invitation is required"); error.status = 403; throw error;
          }
          const invitation = await tx.query("UPDATE staff_invitations SET consumed_at=now() WHERE wallet=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING id",
            [wallet,crypto.createHash("sha256").update(token).digest("hex")]);
          if (!invitation.rowCount) {
            const error = new Error("Invitation expired, used or issued to a different wallet"); error.status=403; throw error;
          }
        }
        const provider = await tx.addProvider({
          id: crypto.randomUUID(),
          wallet,
          name: name.trim(),
          licenseNumber: licenseNumber.trim(),
          specialty: specialty.trim(),
          status: "pending",
          createdAt: new Date().toISOString(),
        });

        await tx.addAudit({
          id: crypto.randomUUID(),
          actor: wallet,
          action: "PROVIDER_REGISTERED",
          providerId: provider.id,
          timestamp: new Date().toISOString(),
        });

        if (transactionAudit && transactionAudit.appendAuditEvent) {
          await transactionAudit.appendAuditEvent({
            actor: wallet,
            action: "PROVIDER_REGISTERED",
            details: { providerId: provider.id, specialty: provider.specialty },
          });
        }

        return provider;
      };
      const provider = store.transaction
        ? await store.transaction(tx => register(tx,new AuditChainService(tx)))
        : await register(store,auditChain);

      res.status(201).json(provider);
    }),

    access: asyncHandler(async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const provider = await store.providerByWallet(wallet);
      if (!provider) {
        return res.status(403).json({ error: "Provider registration required" });
      }
      res.json({
        provider,
        status: provider.status,
        permissions:
          provider.status === "verified"
            ? ["read", "write", "emergency-critical-only"]
            : [],
      });
    }),

    verify: asyncHandler(async (req, res) => {
      const targetWallet = canonicalizeWallet(req.params.wallet);
      const provider = await store.updateProvider(targetWallet, {
        status: "verified",
        verifiedBy: canonicalizeWallet(req.user.wallet),
        verifiedAt: new Date().toISOString(),
      });

      if (!provider) return res.status(404).json({ error: "Provider not found" });

      try {
        if (chain.enabled) {
          await chain.verifyProvider(provider.wallet, true);
        }
        await store.addAudit({
          id: crypto.randomUUID(),
          actor: canonicalizeWallet(req.user.wallet),
          action: "PROVIDER_VERIFIED",
          providerId: provider.id,
          timestamp: new Date().toISOString(),
        });
        if (auditChain && auditChain.appendAuditEvent) {
          await auditChain.appendAuditEvent({
            actor: canonicalizeWallet(req.user.wallet),
            action: "PROVIDER_VERIFIED",
            details: { providerId: provider.id, verifiedWallet: provider.wallet },
          });
        }
        res.json(provider);
      } catch (e) {
        console.error("Provider chain verification error:", {name:e.name, code:e.code || "INTERNAL_ERROR"});
        await store.updateProvider(provider.wallet, {
          status: "pending",
          verifiedBy: null,
          verifiedAt: null,
        });
        res.status(502).json({ error: "Provider verification failed on chain" });
      }
    }),

    updateStatus: asyncHandler(async (req, res) => {
      const targetWallet = canonicalizeWallet(req.params.wallet);
      const { status } = req.body || {};
      const allowed = ["pending", "verified", "suspended"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
      }

      const existing = await store.providerByWallet(targetWallet);
      if (!existing) return res.status(404).json({ error: "Provider not found" });

      const updated = await store.updateProvider(targetWallet, {
        status,
        verifiedBy: status === "verified" ? canonicalizeWallet(req.user.wallet) : (existing.verifiedBy || existing.verified_by || null),
        verifiedAt: status === "verified" ? new Date().toISOString() : (existing.verifiedAt || existing.verified_at || null),
      });

      if (chain.enabled) {
        try {
          await chain.verifyProvider(targetWallet, status === "verified");
        } catch (e) {
          console.error("Chain provider status sync failed, rolling back:", e);
          await store.updateProvider(targetWallet, {
            status: existing.status,
            verifiedBy: existing.verifiedBy || existing.verified_by,
            verifiedAt: existing.verifiedAt || existing.verified_at,
          });
          return res.status(502).json({ error: "Provider status change failed on chain" });
        }
      }

      await store.addAudit({
        id: crypto.randomUUID(),
        actor: canonicalizeWallet(req.user.wallet),
        action: `PROVIDER_STATUS_CHANGED_${status.toUpperCase()}`,
        providerId: existing.id,
        metadata: { previousStatus: existing.status, newStatus: status },
        timestamp: new Date().toISOString(),
      });

      await auditChain.appendAuditEvent({actor:req.user.wallet,action:"PROVIDER_STATUS_CHANGED",details:{providerId:updated.id,status}});
      res.json(updated);
    }),

    list: asyncHandler(async (req, res) => {
      const page = pagination(req.query);
      if (req.query.status!==undefined && !["pending","verified","suspended"].includes(req.query.status)) return res.status(400).json({error:"Invalid provider status"});
      const rows = store.listProvidersPage ? await store.listProvidersPage(req.query.status,page)
        : memoryPage(await store.providers(req.query.status),page);
      return pageResponse(res,rows,page);

    }),
  };
}

module.exports = { createDoctorController };
