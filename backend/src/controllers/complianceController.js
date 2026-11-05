const crypto = require("crypto");
const { buildIPSBundle } = require("../services/fhirService");
const { canonicalJsonStringify } = require("./recordController");
const { asyncHandler } = require("../utils/asyncHandler");
const { canonicalizeWallet } = require("../config/db");

function createComplianceController({ store, ipfs, encryption, envelopeEncryption, auditChain }) {
  return {
    archive: asyncHandler(async (req,res) => {
      const patient = await store.patientByWallet(req.user.wallet);
      if (!patient) return res.status(403).json({error:"Patient enrollment required"});
      const records = await store.recordsForPatient(patient.id);
      const exported = [];
      for (const record of records) {
        const encrypted = await ipfs.fetchEncrypted(record.ipfsCid);
        const hash = crypto.createHash("sha256").update(canonicalJsonStringify(encrypted)).digest("hex");
        if (hash !== record.encryptedHash) throw new Error("Record integrity check failed");
        let clinicalData;
        if (encrypted.version === 2) {
          if (encrypted.aad?.patientId !== patient.id || encrypted.aad?.recordId !== record.id) throw new Error("Record binding mismatch");
          clinicalData = (await envelopeEncryption.decryptField(patient.id,encrypted)).value;
        } else clinicalData = encryption.decryptJson(encrypted);
        exported.push({id:record.id,type:record.recordType,createdAt:record.createdAt,clinicalData});
      }
      await auditChain.appendAuditEvent({patientId:patient.id,actor:req.user.wallet,action:"PATIENT_ARCHIVE_EXPORTED",details:{recordCount:exported.length}});
      res.setHeader("Content-Disposition",'attachment; filename="goldenhour-patient-archive.json"');
      res.json({exportedAt:new Date().toISOString(),patient,records:exported,audit:await store.auditForPatient(patient.id)});
    }),

    exportData: async (req, res) => {
      try {
        const patientId = req.params.patientId;
        const patient = await store.patientById(patientId);
        if (!patient) return res.status(404).json({ error: "Patient not found" });

        // Lock down: Only the patient themselves can export their own records
        const callerWallet = canonicalizeWallet(req.user?.wallet);
        const ownerWallet = canonicalizeWallet(patient.wallet);

        const isOwner = callerWallet && ownerWallet && callerWallet === ownerWallet;
        const hasPatientIdMatch = req.user?.patientId && req.user.patientId === patient.id;

        if (!isOwner && !hasPatientIdMatch) {
          return res.status(403).json({
            error: "Access denied: Patients are strictly authorized to export only their own clinical data",
          });
        }

        // Build FHIR R4 Bundle
        const fhirBundle = buildIPSBundle(patient);
        res.json(fhirBundle);
      } catch (err) {
        console.error("Compliance export error:", err);
        res.status(500).json({ error: "Failed to export FHIR patient data" });
      }
    },

    submitDSR: async (req, res) => {
      try {
        const callerWallet = canonicalizeWallet(req.user?.wallet);
        if (!callerWallet) {
          return res.status(401).json({ error: "Authenticated wallet identity required" });
        }

        // Strictly extract patientId from authenticated token or database lookup by caller wallet
        let patient = null;
        if (req.user?.patientId) {
          patient = await store.patientById(req.user.patientId);
        }
        if (!patient) {
          patient = await store.patientByWallet(callerWallet);
        }

        if (!patient) {
          return res.status(403).json({
            error: "Access denied: Data Subject Requests can only be submitted by registered patients",
          });
        }

        const patientId = patient.id;
        const { requestType, details } = req.body || {};
        const validTypes = ["access", "correction", "grievance"];

        if (requestType === "erasure") {
          return res.status(400).json({
            error: "Automated erasure request is temporarily disabled pending Step 4 legal-hold verification and persistent KMS implementation",
          });
        }

        if (!validTypes.includes(requestType)) {
          return res.status(400).json({
            error: `requestType must be one of: ${validTypes.join(", ")}`,
          });
        }

        const dsrRecord = {
          id: crypto.randomUUID(),
          patientId,
          requestType,
          details: details || "Statutory Data Principal Request",
          status: "submitted",
          createdAt: new Date().toISOString(),
        };

        // If PostgresStore with data_subject_requests table, persist directly
        if (store.query) {
          try {
            await store.query(
              "INSERT INTO data_subject_requests (id, patient_id, request_type, details, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
              [dsrRecord.id, patientId, requestType, dsrRecord.details, dsrRecord.status, dsrRecord.createdAt]
            );
          } catch (e) {
            throw new Error("Could not persist patient request", {cause: e});
          }
        }

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId,
          actor: callerWallet,
          action: `DSR_REQUEST_${requestType.toUpperCase()}`,
          metadata: { dsrId: dsrRecord.id, requestType },
          timestamp: new Date().toISOString(),
        });

        res.status(201).json({
          message: `Data Subject Request recorded in audit trail under ID ${dsrRecord.id}.`,
          dsr: dsrRecord,
        });
      } catch (err) {
        console.error("Compliance DSR error:", err);
        res.status(500).json({ error: "Failed to submit Data Subject Request" });
      }
    },

    executeErasure: async (req, res) => {
      // Step 1 mandate: disable erasure route until Step 4 (legal-hold check & persistent KMS) is completed
      return res.status(503).json({
        error: "Erasure endpoint is disabled pending Step 4 legal-hold check and cryptographic key registry integration",
      });
    },
  };
}

module.exports = { createComplianceController };
