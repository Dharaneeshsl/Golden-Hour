const {ownsPatient} = require("../utils/identity");
const {auditDisclosure} = require("../services/disclosureAudit");
const crypto = require("crypto");
const { buildIPSBundle } = require("../services/fhirService");
const { canonicalJsonStringify } = require("./recordController");
const { asyncHandler } = require("../utils/asyncHandler");
const { canonicalizeWallet } = require("../config/db");

function createComplianceController({ store, ipfs, encryption, envelopeEncryption, auditChain }) {
  return {
    auditExport: require("./auditExportController")(store),
    hold: asyncHandler(async (req,res) => {
      if (req.user.role !== "admin") return res.sendStatus(403);
      const {active,caseReference} = req.body || {};
      if (typeof active!=="boolean" || typeof caseReference!=="string" || caseReference.length<10 || caseReference.length>200) return res.status(400).json({error:"A hospital retention case reference is required"});
      await store.transaction(async tx => {
        const patient = (await tx.query("SELECT id FROM patients WHERE id=$1 FOR UPDATE",[req.params.patientId])).rows[0];
        if (!patient) {const error=new Error("Patient unavailable");error.status=404;throw error;}
        await tx.query("INSERT INTO patient_data_holds(patient_id,case_reference,active,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT(patient_id) DO UPDATE SET case_reference=EXCLUDED.case_reference,active=EXCLUDED.active,updated_by=EXCLUDED.updated_by,updated_at=now()",
          [patient.id,caseReference,active,req.user.wallet]);
        await new (require("../services/auditChainService").AuditChainService)(tx).appendAuditEvent({patientId:patient.id,actor:req.user.wallet,action:"RETENTION_HOLD_CHANGED",details:{active}});
      });
      res.json({active});
    }),
    myRequests: asyncHandler(async (req,res) => {
      const patient = await store.patientByWallet(req.user.wallet);
      if (!patient) return res.sendStatus(403);
      res.json((await store.query("SELECT id,request_type,status,created_at,resolved_at,resolution_notes FROM data_subject_requests WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 100",[patient.id])).rows);
    }),
    resolveRequest: asyncHandler(async (req,res) => {
      if (req.user.role !== "admin") return res.sendStatus(403);
      const {status,caseReference} = req.body || {};
      if (!["completed","rejected"].includes(status) || typeof caseReference!=="string" || caseReference.length<10 || caseReference.length>200) return res.status(400).json({error:"A decision and hospital case reference are required"});
      const result = await store.transaction(async tx => {
        const request = (await tx.query("SELECT * FROM data_subject_requests WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
        if (!request || ["completed","rejected"].includes(request.status)) return null;
        if (request.request_type==="erasure" && status==="completed") return null;
        await tx.query("UPDATE data_subject_requests SET status=$2,resolution_notes=$3,resolved_at=now() WHERE id=$1",[request.id,status,caseReference]);
        await new (require("../services/auditChainService").AuditChainService)(tx).appendAuditEvent({patientId:request.patient_id,actor:req.user.wallet,action:"PATIENT_REQUEST_RESOLVED",details:{requestId:request.id,status}});
        return {id:request.id,status};
      });
      if (!result) return res.status(409).json({error:"Request already resolved, unavailable, or requires the clinical erasure operator"});
      res.json(result);
    }),
    requests: asyncHandler(async (req,res) => {
      if (req.user.role !== "admin") return res.sendStatus(403);
      res.json((await store.query("SELECT id,patient_id,request_type,status,created_at FROM data_subject_requests ORDER BY created_at DESC LIMIT 100")).rows);
    }),
    archive: asyncHandler(async (req,res) => {
      const patient = await store.patientByWallet(req.user.wallet);
      if (!patient) return res.status(403).json({error:"Patient enrollment required"});
      let cursor={records:0,audit:0};
      let manifest;
      if (req.query.cursor) {
        try {cursor=JSON.parse(Buffer.from(req.query.cursor,"base64url").toString("utf8"));}
        catch {return res.status(400).json({error:"Invalid archive cursor"});}
        if (typeof cursor.exportId!=="string" || !/^[a-f0-9-]{36}$/i.test(cursor.exportId) ||
            ![cursor.records,cursor.audit].every(offset=>Number.isInteger(offset) && offset>=0 && offset<=100000)) {
          return res.status(400).json({error:"Invalid archive cursor"});
        }
        manifest=(await store.query("SELECT * FROM patient_archive_exports WHERE id=$1 AND patient_id=$2 AND principal=$3 AND expires_at>now()",[cursor.exportId,patient.id,req.user.wallet])).rows[0];
      } else {
        if (!await store.emergencyQuota("archive:"+patient.id,10)) return res.status(429).json({error:"Too many archive requests. Try again later."});
        manifest=await store.beginArchive(patient.id,req.user.wallet);
      }
      if (!manifest || manifest.revision!==patient.revision) return res.status(409).json({error:"Archive expired or summary changed. Start a new download."});
      const limit=5;
      const recordIds=manifest.record_ids.slice(cursor.records,cursor.records+limit);
      const auditIds=manifest.audit_ids.slice(cursor.audit,cursor.audit+limit);
      const records=[];
      for (const id of recordIds) {
        const record=await store.recordById(patient.id,id);
        if (!record) return res.status(409).json({error:"Records changed during export. Start a new download."});
        records.push(record);
      }
      const audit=[];
      for (const id of auditIds) {
        const event=await store.auditById(id);
        if (!event || event.patientId!==patient.id) return res.status(409).json({error:"Access history changed during export. Start a new download."});
        audit.push(event);
      }
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
      await auditDisclosure(store,auditChain,{patientId:patient.id,actor:req.user.wallet,action:"PATIENT_ARCHIVE_EXPORTED",metadata:{recordCount:exported.length}});
      res.setHeader("Content-Disposition",'attachment; filename="goldenhour-patient-archive.json"');
      const nextRecords=cursor.records+records.length,nextAudit=cursor.audit+audit.length;
      const hasMore=nextRecords<manifest.record_ids.length || nextAudit<manifest.audit_ids.length;
      const nextCursor=hasMore ? Buffer.from(JSON.stringify({exportId:manifest.id,records:nextRecords,audit:nextAudit})).toString("base64url") : null;
      res.json({exportedAt:new Date(manifest.created_at).toISOString(),patient,records:exported,audit,nextCursor});

    }),

    exportData: async (req, res) => {
      try {
        const patientId = req.params.patientId;
        const patient = await store.patientById(patientId);
        if (!patient) return res.status(404).json({ error: "Patient not found" });

        // Lock down: Only the patient themselves can export their own records
        const callerWallet = canonicalizeWallet(req.user?.wallet);
        const ownerWallet = canonicalizeWallet(patient.wallet);

        const isOwner = ownsPatient(patient,req.user);
        const hasPatientIdMatch = req.user?.patientId && req.user.patientId === patient.id;

        if (!isOwner && !hasPatientIdMatch) {
          return res.status(403).json({
            error: "Access denied: Patients are strictly authorized to export only their own clinical data",
          });
        }

        // Build FHIR R4 Bundle
        const fhirBundle = buildIPSBundle(patient);
        await auditDisclosure(store,auditChain,{patientId:patient.id,actor:req.user.wallet,action:"PATIENT_SUMMARY_EXPORTED",metadata:{format:"FHIR"}});
        res.json(fhirBundle);
      } catch (err) {
        console.error("Compliance export error:", {name:err.name, code:err.code || "INTERNAL_ERROR"});
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
        if (details !== undefined && (typeof details !== "string" || details.length>2000)) return res.status(400).json({error:"Request details must be text up to 2000 characters"});
        const validTypes = ["access", "correction", "grievance", "erasure"];

        if (requestType === "erasure" && process.env.CLINICAL_ERASURE_ENABLED !== "true") {
          return res.status(400).json({
            error: "The hospital must configure its retention process and independent erasure ledger before accepting clinical erasure requests",
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
        console.error("Compliance DSR error:", {name:err.name, code:err.code || "INTERNAL_ERROR"});
        res.status(500).json({ error: "Failed to submit Data Subject Request" });
      }
    },

    executeErasure: async (req, res) => {
      // Step 1 mandate: disable erasure route until Step 4 (legal-hold check & persistent KMS) is completed
      return res.status(503).json({
        code: "OPERATOR_ERASURE_REQUIRED",
        error: "Clinical erasure is executed by an authorized hospital operator after retention and approval checks",
      });
    },
  };
}

module.exports = { createComplianceController };
