const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");

function validObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function createPatientController({ store, chain }) {
  const owned = async (req, res, id) => {
    const patient = await store.patientById(id);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return null;
    }
    if (
      req.user.role !== "admin" &&
      canonicalizeWallet(patient.wallet) !== canonicalizeWallet(req.user.wallet)
    ) {
      res.status(403).json({ error: "Patient data access denied" });
      return null;
    }
    return patient;
  };

  return {
    create: async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const { profile, critical } = req.body || {};

      if (!validObject(profile) || !validObject(critical)) {
        return res.status(400).json({ error: "profile and critical must be valid objects" });
      }

      if (await store.patientByWallet(wallet)) {
        return res.status(409).json({ error: "Patient already registered" });
      }

      try {
        let chainPatientId = chain.enabled ? await chain.patientId(wallet) : null;
        if (chain.enabled && !chainPatientId) {
          const onChain = await chain.registerPatient(wallet, profile, critical);
          chainPatientId = onChain.patientId;
        }

        const patient = await store.addPatient({
          id: crypto.randomUUID(),
          wallet,
          profile,
          critical,
          createdAt: new Date().toISOString(),
        });

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId: patient.id,
          actor: wallet,
          action: "PATIENT_REGISTERED",
          metadata: { chainPatientId },
          timestamp: new Date().toISOString(),
        });

        res.status(201).json({ ...patient, chainPatientId });
      } catch (e) {
        console.error("Patient creation error:", e);
        res.status(502).json({ error: "Patient registration failed" });
      }
    },

    update: async (req, res) => {
      const patient = await owned(req, res, req.params.id);
      if (!patient) return;

      const { profile, critical } = req.body || {};
      if (profile && !validObject(profile)) {
        return res.status(400).json({ error: "profile must be an object" });
      }
      if (critical && !validObject(critical)) {
        return res.status(400).json({ error: "critical must be an object" });
      }

      try {
        const updated = await store.updatePatient(patient.id, { profile, critical });

        if (chain.enabled) {
          await chain.updatePatientHashes(patient.wallet, updated.profile, updated.critical);
        }

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId: patient.id,
          actor: canonicalizeWallet(req.user.wallet),
          action: "PATIENT_PROFILE_UPDATED",
          metadata: { updatedFields: Object.keys(req.body || {}) },
          timestamp: new Date().toISOString(),
        });

        res.json(updated);
      } catch (e) {
        console.error("Patient update error:", e);
        res.status(500).json({ error: "Failed to update patient profile" });
      }
    },

    get: async (req, res) => {
      const patient = await owned(req, res, req.params.id);
      if (!patient) return;

      res.json({
        ...patient,
        records: await store.recordsForPatient(patient.id),
        audit: await store.auditForPatient(patient.id),
      });
    },

    listAll: async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin authorization required" });
      }
      const patients = await store.allPatients();
      res.json(patients);
    },

    me: async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const patient = await store.patientByWallet(wallet);
      if (!patient) {
        return res.status(404).json({
          error: "Patient not registered",
          code: "PATIENT_NOT_REGISTERED",
        });
      }
      res.json({ patientId: patient.id, patient });
    },
  };
}

module.exports = { createPatientController };
