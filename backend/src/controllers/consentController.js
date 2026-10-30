const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const ALLOWED_SCOPES = ["records", "profile", "critical"];
const ALLOWED_PURPOSES = ["EMERGENCY_TREATMENT", "CONSULTATION", "SECOND_OPINION", "RESEARCH"];

function validateScope(scope) {
  if (!scope) return ["records"];
  if (!Array.isArray(scope)) return null;
  if (scope.length === 0) return null;
  for (const s of scope) {
    if (typeof s !== "string" || !ALLOWED_SCOPES.includes(s)) {
      return null;
    }
  }
  return scope;
}

function createConsentController({ store, chain, auditChain }) {
  return {
    grant: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      if (req.user.role === "admin") {
        return res.status(403).json({ error: "Administrators have read-only consent oversight" });
      }
      if (patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Only the patient can grant consent" });
      }

      const providerWallet = canonicalizeWallet(req.body.wallet);
      const provider = await store.providerByWallet(providerWallet);
      if (!provider || provider.status !== "verified") {
        return res.status(400).json({ error: "A verified provider wallet is required" });
      }

      const scope = validateScope(req.body.scope);
      if (!scope) {
        return res.status(400).json({
          error: `Invalid consent scope. Supported scopes: ${ALLOWED_SCOPES.join(", ")}`,
        });
      }

      const purpose = req.body.purpose || "EMERGENCY_TREATMENT";
      if (!ALLOWED_PURPOSES.includes(purpose)) {
        return res.status(400).json({
          error: `Invalid purpose. Allowed purposes: ${ALLOWED_PURPOSES.join(", ")}`,
        });
      }

      const expiresAt = req.body.expiresAt || null;
      if (expiresAt && (isNaN(new Date(expiresAt).getTime()) || new Date(expiresAt) <= new Date())) {
        return res.status(400).json({
          error: "expiresAt must be a valid future ISO timestamp",
        });
      }

      try {
        if (chain.enabled) {
          const chainPatientId = await chain.patientId(patient.wallet);
          if (!chainPatientId) throw new Error("Patient is not registered on chain");
          await chain.grantAccess(patient.wallet, chainPatientId, provider.wallet, 0);
        }

        const consent = await store.grantConsent({
          id: crypto.randomUUID(),
          patientId: patient.id,
          providerId: provider.id,
          scope,
          purpose,
          expiresAt,
          grantedAt: new Date().toISOString(),
        });

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId: patient.id,
          actor: reqWallet,
          action: "CONSENT_GRANTED",
          providerId: provider.id,
          metadata: { scope: consent.scope, purpose, expiresAt },
          timestamp: new Date().toISOString(),
        });

        if (auditChain && auditChain.appendAuditEvent) {
          await auditChain.appendAuditEvent({
            id: consent.id,
            patientId: patient.id,
            actor: reqWallet,
            action: "CONSENT_GRANTED",
            details: { scope: consent.scope, purpose, expiresAt, providerId: provider.id },
          });
        }

        res.status(201).json({
          ...consent,
          providerWallet: provider.wallet,
          providerName: provider.name,
          providerSpecialty: provider.specialty,
        });
      } catch (e) {
        console.error("Consent grant error:", e);
        res.status(502).json({ error: "Consent grant failed" });
      }
    }),

    revoke: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      if (patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Only the patient can revoke consent" });
      }

      const providerWallet = canonicalizeWallet(req.body.wallet);
      if (!providerWallet) {
        return res.status(400).json({ error: "Provider wallet address is required" });
      }
      const provider = await store.providerByWallet(providerWallet);
      if (!provider) return res.status(404).json({ error: "Provider not found" });

      try {
        if (chain.enabled) {
          const chainPatientId = await chain.patientId(patient.wallet);
          if (chainPatientId) {
            await chain.revokeAccess(patient.wallet, chainPatientId, provider.wallet);
          }
        }

        const consent = await store.revokeConsent(patient.id, provider.id);
        if (!consent) {
          return res.status(404).json({ error: "Active consent not found" });
        }

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId: patient.id,
          actor: reqWallet,
          action: "CONSENT_REVOKED",
          providerId: provider.id,
          metadata: { providerWallet: provider.wallet },
          timestamp: new Date().toISOString(),
        });

        if (auditChain && auditChain.appendAuditEvent) {
          await auditChain.appendAuditEvent({
            id: consent.id,
            patientId: patient.id,
            actor: reqWallet,
            action: "CONSENT_REVOKED",
            details: { providerWallet: provider.wallet, providerId: provider.id },
          });
        }

        res.json(consent);
      } catch (e) {
        console.error("Consent revocation error:", e);
        res.status(502).json({ error: "Consent revocation failed" });
      }
    }),

    list: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      if (req.user.role !== "admin" && patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Patient consent access denied" });
      }

      res.json(await store.consentsForPatient(patient.id));
    }),

    forPatient: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      if (req.user.role !== "admin" && patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Patient consent access denied" });
      }

      res.json(await store.consentsForPatient(patient.id));
    }),

    listForProvider: asyncHandler(async (req, res) => {
      const providerWallet = canonicalizeWallet(req.user.wallet);
      const provider = await store.providerByWallet(providerWallet);
      if (!provider || provider.status !== "verified") {
        return res.status(403).json({ error: "Verified provider access required" });
      }

      res.json(await store.consentsForProvider(provider.id));
    }),

    forProvider: asyncHandler(async (req, res) => {
      const providerWallet = canonicalizeWallet(req.user.wallet);
      const provider = await store.providerByWallet(providerWallet);
      if (!provider || provider.status !== "verified") {
        return res.status(403).json({ error: "Verified provider access required" });
      }

      res.json(await store.consentsForProvider(provider.id));
    }),
  };
}

module.exports = { createConsentController };
