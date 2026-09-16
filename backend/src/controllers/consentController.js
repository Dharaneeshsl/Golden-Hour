const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");

const ALLOWED_SCOPES = ["records"];

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

function createConsentController({ store, chain }) {
  return {
    grant: async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      if (req.user.role !== "admin" && patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Only the patient can grant consent" });
      }
      if (req.user.role === "admin") {
        return res.status(403).json({ error: "Administrators have read-only consent oversight" });
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
          grantedAt: new Date().toISOString(),
        });

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId: patient.id,
          actor: reqWallet,
          action: "CONSENT_GRANTED",
          providerId: provider.id,
          metadata: { scope: consent.scope },
          timestamp: new Date().toISOString(),
        });

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
    },

    revoke: async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      if (patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Only the patient can revoke consent" });
      }

      const providerWallet = canonicalizeWallet(req.body.wallet);
      const provider = await store.providerByWallet(providerWallet);
      if (!provider) return res.status(404).json({ error: "Provider not found" });

      try {
        if (chain.enabled) {
          const chainPatientId = await chain.patientId(patient.wallet);
          if (!chainPatientId) throw new Error("Patient is not registered on chain");
          await chain.revokeAccess(patient.wallet, chainPatientId, provider.wallet);
        }

        const consent = await store.revokeConsent(patient.id, provider.id);
        if (!consent) return res.status(404).json({ error: "Active consent not found" });

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId: patient.id,
          actor: reqWallet,
          action: "CONSENT_REVOKED",
          providerId: provider.id,
          timestamp: new Date().toISOString(),
        });

        res.json({
          ...consent,
          providerWallet: provider.wallet,
          providerName: provider.name,
          providerSpecialty: provider.specialty,
        });
      } catch (e) {
        console.error("Consent revoke error:", e);
        res.status(502).json({ error: "Consent revoke failed" });
      }
    },

    list: async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      if (req.user.role !== "admin" && patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Consent access denied" });
      }

      res.json(await store.consentsForPatient(patient.id));
    },

    listForProvider: async (req, res) => {
      const reqWallet = canonicalizeWallet(req.user.wallet);
      const provider = await store.providerByWallet(reqWallet);
      if (!provider || provider.status !== "verified") {
        return res.status(403).json({ error: "Active verified provider context required" });
      }
      res.json(await store.consentsForProvider(provider.id));
    },
  };
}

module.exports = { createConsentController };