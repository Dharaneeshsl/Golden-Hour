const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");

function createEmergencyController({ store, chain }) {
  const canAudit = (req, patient) =>
    req.user.role === "admin" ||
    canonicalizeWallet(patient.wallet) === canonicalizeWallet(req.user.wallet);

  return {
    create: async (req, res) => {
      const { patientId, justification } = req.body || {};
      const patient = await store.patientById(patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!justification || justification.trim().length < 10) {
        return res
          .status(400)
          .json({ error: "A detailed justification of at least 10 characters is required" });
      }

      // Re-verify provider active status
      if (req.provider && req.provider.status !== "verified") {
        return res.status(403).json({ error: "Provider account is not active or verified" });
      }

      try {
        let chainPatientId = chain.enabled ? await chain.patientId(patient.wallet) : null;
        if (chain.enabled && !chainPatientId) {
          throw new Error("Patient is not registered on chain");
        }
        if (chain.enabled) {
          await chain.triggerEmergency(
            chainPatientId,
            req.provider.wallet,
            justification.trim()
          );
        }

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const event = await store.addAudit({
          id: crypto.randomUUID(),
          patientId,
          actor: canonicalizeWallet(req.provider.wallet),
          action: "EMERGENCY_BREAK_GLASS",
          providerId: req.provider.id,
          metadata: { justification: justification.trim(), scope: "CRITICAL_ONLY" },
          expiresAt,
          timestamp: new Date().toISOString(),
        });

        res.json({
          accessId: event.id,
          patientId,
          critical: patient.critical,
          expiresAt,
          audit: event,
        });
      } catch (e) {
        console.error("Emergency create error:", e);
        res.status(502).json({ error: "Emergency access trigger failed" });
      }
    },

    critical: async (req, res) => {
      try {
        const event = await store.auditById(req.params.accessId);
        if (!event || event.action !== "EMERGENCY_BREAK_GLASS") {
          return res.status(404).json({ error: "Emergency access event not found" });
        }

        if (new Date(event.expiresAt).getTime() <= Date.now()) {
          return res.status(410).json({ error: "Emergency access window has expired" });
        }

        const patient = await store.patientById(event.patientId);
        if (!patient) return res.status(404).json({ error: "Patient not found" });

        const requestorWallet = canonicalizeWallet(req.user.wallet);
        const eventActorWallet = canonicalizeWallet(event.actor);

        if (req.user.role !== "admin" && eventActorWallet !== requestorWallet) {
          return res.status(403).json({ error: "Emergency access denied" });
        }

        // Check if provider is currently suspended
        if (req.user.role !== "admin") {
          const provider = await store.providerByWallet(requestorWallet);
          if (!provider || provider.status !== "verified") {
            return res.status(403).json({ error: "Provider status is no longer verified or active" });
          }
        }

        // Log every view of the critical medical payload for audit trail integrity
        await store.addAudit({
          id: crypto.randomUUID(),
          patientId: patient.id,
          actor: requestorWallet,
          action: "EMERGENCY_CRITICAL_VIEW",
          providerId: req.user.role !== "admin" ? req.provider?.id : null,
          metadata: { accessId: req.params.accessId },
          timestamp: new Date().toISOString(),
        });

        res.json({
          patientId: patient.id,
          critical: patient.critical,
          expiresAt: event.expiresAt,
        });
      } catch (e) {
        console.error("Emergency critical retrieval error:", e);
        res.status(500).json({ error: "Failed to retrieve critical emergency payload" });
      }
    },

    audit: async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!canAudit(req, patient)) {
        return res.status(403).json({ error: "Audit access denied" });
      }

      res.json(await store.auditForPatient(patient.id));
    },

    recentAudits: async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin authorization required" });
      }
      res.json(await store.recentAudits(100));
    },
  };
}

module.exports = { createEmergencyController };