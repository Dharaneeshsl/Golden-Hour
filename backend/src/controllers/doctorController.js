const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");

function createDoctorController({ store, chain }) {
  return {
    register: async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const { name, licenseNumber, specialty } = req.body || {};

      if (!name || !licenseNumber || !specialty) {
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

      const provider = await store.addProvider({
        id: crypto.randomUUID(),
        wallet,
        name: name.trim(),
        licenseNumber: licenseNumber.trim(),
        specialty: specialty.trim(),
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      await store.addAudit({
        id: crypto.randomUUID(),
        actor: wallet,
        action: "PROVIDER_REGISTERED",
        providerId: provider.id,
        timestamp: new Date().toISOString(),
      });

      res.status(201).json(provider);
    },

    access: async (req, res) => {
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
    },

    verify: async (req, res) => {
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
        res.json(provider);
      } catch (e) {
        console.error("Provider chain verification error:", e);
        await store.updateProvider(provider.wallet, {
          status: "pending",
          verifiedBy: null,
          verifiedAt: null,
        });
        res.status(502).json({ error: "Provider verification failed on chain" });
      }
    },

    updateStatus: async (req, res) => {
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
        verifiedBy: status === "verified" ? canonicalizeWallet(req.user.wallet) : existing.verified_by,
        verifiedAt: status === "verified" ? new Date().toISOString() : existing.verified_at,
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

      res.json(updated);
    },

    list: async (req, res) => {
      res.json(await store.providers(req.query.status));
    },
  };
}

module.exports = { createDoctorController };