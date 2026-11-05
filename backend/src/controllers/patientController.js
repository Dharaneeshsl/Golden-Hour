const {pagination,pageResponse,memoryPage} = require("../utils/pagination");
const {ownsPatient} = require("../utils/identity");
const {auditDisclosure} = require("../services/disclosureAudit");
const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

function validObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validCritical(value) {
  if (!validObject(value)) return false;
  if (value.bloodGroup !== undefined && (typeof value.bloodGroup !== "string" || value.bloodGroup.length>100)) return false;
  return ["allergies","conditions","medications"].every(key =>
    value[key] === undefined || (Array.isArray(value[key]) && value[key].length<=100 &&
      value[key].every(item => typeof item === "string" && item.length<=500)));
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
    if (!ownsPatient(patient,req.user)) {
      res.status(403).json({ error: "Patient data access denied" });
      return null;
    }
    return patient;
  };

  return {
    issueCard: asyncHandler(async (req, res) => {
      const patient = await store.patientByWallet(req.user.wallet);
      if (!patient) return res.status(404).json({error: "Patient enrollment required"});
      const token = crypto.randomBytes(32).toString("hex");
      await store.replaceCard(patient.id, crypto.createHash("sha256").update(token).digest("hex"));
      res.status(201).json({token});
    }),

    create: asyncHandler(async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const { profile, critical } = req.body || {};

      if (!validObject(profile) || !validCritical(critical)) {
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
          userId:req.user.userId,
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
        console.error("Patient creation error:", {name:e.name, code:e.code || "INTERNAL_ERROR"});
        res.status(502).json({ error: "Patient registration failed" });
      }
    }),

    me: asyncHandler(async (req, res) => {
      const wallet = canonicalizeWallet(req.user.wallet);
      const patient = await store.patientByWallet(wallet);
      if (!patient) return res.status(404).json({ error: "Patient profile not found" });
      await auditDisclosure(store,auditChain,{patientId:patient.id,actor:req.user.wallet,action:"PATIENT_PROFILE_VIEWED",metadata:{scope:"profile-and-critical"}});
      res.json({
        ...patient,
        patientId: patient.id,
        records: store.listRecordsPage ? (await store.listRecordsPage(patient.id,{limit:50,offset:0})).slice(0,50) : (await store.recordsForPatient(patient.id)).slice(0,50),
        audit: store.listAuditPage ? (await store.listAuditPage(patient.id,{limit:50,offset:0})).slice(0,50) : (await store.auditForPatient(patient.id)).slice(0,50),
      });
    }),

    update: asyncHandler(async (req, res) => {
      const patient = await owned(req, res, req.params.id);
      if (!patient) return;

      const { profile, critical } = req.body || {};
      if (profile && !validObject(profile)) {
        return res.status(400).json({ error: "profile must be an object" });
      }
      if (critical !== undefined && !validCritical(critical)) {
        return res.status(400).json({ error: "critical must be an object" });
      }

      try {
        const revision = req.body?.revision;
        if (!Number.isInteger(revision)) return res.status(428).json({error: "Reload the patient summary before editing"});
        const updated = await store.updatePatient(patient.id, { profile, critical, revision });
        if (!updated) return res.status(409).json({error: "The summary changed. Reload and review the latest version."});

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
        console.error("Patient update error:", {name:e.name, code:e.code || "INTERNAL_ERROR"});
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
          audit: store.listAuditPage ? (await store.listAuditPage(patient.id,{limit:50,offset:0})).slice(0,50) : (await store.auditForPatient(patient.id)).slice(0,50),
        });
      }

      if (!ownsPatient(patient,req.user)) {
        return res.status(403).json({ error: "Patient data access denied" });
      }

      await auditDisclosure(store,auditChain,{patientId:patient.id,actor:req.user.wallet,action:"PATIENT_PROFILE_VIEWED",metadata:{scope:"profile-and-critical"}});
      res.json({
        ...patient,
        records: store.listRecordsPage ? (await store.listRecordsPage(patient.id,{limit:50,offset:0})).slice(0,50) : (await store.recordsForPatient(patient.id)).slice(0,50),
        audit: store.listAuditPage ? (await store.listAuditPage(patient.id,{limit:50,offset:0})).slice(0,50) : (await store.auditForPatient(patient.id)).slice(0,50),
      });
    }),

    listAll: asyncHandler(async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin authorization required" });
      }
      const page = pagination(req.query);
      const rows = store.listPatientsPage ? await store.listPatientsPage(page) : memoryPage(await store.allPatients(),page);
      const sanitized = rows.map(patient=>({
        id:patient.id,wallet:patient.wallet,createdAt:patient.createdAt,
        hasCriticalData:patient.hasCriticalData ?? Boolean(patient.critical && Object.keys(patient.critical).length)
      }));
      return pageResponse(res,sanitized,page);

    }),
  };
}

module.exports = { createPatientController };
