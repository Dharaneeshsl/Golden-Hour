const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

function validObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function createPatientController({ store, chain, auditChain }) {
  const owned = async (req, res, id) => {
    const patient = await store.patientById(id);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return null;
    }
    const patientWallet = canonicalizeWallet(patient.wallet);
    const reqWallet = canonicalizeWallet(req.user.wallet);
    if (patientWallet !== reqWallet) {
      res.status(403).json({ error: "Patient data access denied" });
      return null;
    }
    return patient;
  };

  return {
    create: asyncHandler(async (req, res) => {
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

        if (auditChain && auditChain.appendAuditEvent) {
          await auditChain.appendAuditEvent({
            patientId: patient.id,
            actor: wallet,
            action: "PATIENT_REGISTERED",
            details: { chainPatientId },
          });
        }

        res.status(201).json({ ...patient, chainPatientId });
      } catch (e) {
        console.error("Patient creation error:", e);
        res.status(502).json({ error: "Patient registration failed" });
      }
    }),

    me: asyncHandler(async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const patient = await store.patientByWallet(wallet);
      if (!patient) return res.status(404).json({ error: "Patient profile not found" });
      res.json({
        ...patient,
        patientId: patient.id,
        records: await store.recordsForPatient(patient.id),
        audit: await store.auditForPatient(patient.id),
      });
    }),

    update: asyncHandler(async (req, res) => {
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

        if (auditChain && auditChain.appendAuditEvent) {
          await auditChain.appendAuditEvent({
            patientId: patient.id,
            actor: canonicalizeWallet(req.user.wallet),
            action: "PATIENT_PROFILE_UPDATED",
            details: { updatedFields: Object.keys(req.body || {}) },
          });
        }

        res.json(updated);
      } catch (e) {
        console.error("Patient update error:", e);
        res.status(500).json({ error: "Failed to update patient profile" });
      }
    }),

    get: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const reqWallet = canonicalizeWallet(req.user.wallet);
      const patientWallet = canonicalizeWallet(patient.wallet);

      // B5: System Admin has audit oversight but clinical PHI is redacted
      if (req.user.role === "admin") {
        return res.json({
          id: patient.id,
          wallet: patient.wallet,
          createdAt: patient.createdAt,
          records: [],
          audit: await store.auditForPatient(patient.id),
        });
      }

      if (patientWallet !== reqWallet) {
        return res.status(403).json({ error: "Patient data access denied" });
      }

      res.json({
        ...patient,
        records: await store.recordsForPatient(patient.id),
        audit: await store.auditForPatient(patient.id),
      });
    }),

    listAll: asyncHandler(async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin authorization required" });
      }
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const patients = await store.allPatients();
      
      // B5: Redact clinical PHI from bulk administration listing
      const sanitized = patients.slice(offset, offset + limit).map((p) => ({
        id: p.id,
        wallet: p.wallet,
        createdAt: p.createdAt,
        hasCriticalData: !!(p.critical && Object.keys(p.critical).length > 0),
      }));
      res.json(sanitized);
    }),
  };
}

module.exports = { createPatientController };
