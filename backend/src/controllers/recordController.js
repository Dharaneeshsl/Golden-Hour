const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

function canonicalJsonStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(obj[k]))
      .join(",") +
    "}"
  );
}

function createRecordController({ store, encryption, ipfs, chain, auditChain, envelopeEncryption }) {
  const canRead = async (req, patient) => {
    const reqWallet = canonicalizeWallet(req.user.wallet);
    const patientWallet = canonicalizeWallet(patient.wallet);

    // Patient reading their own records
    if (patientWallet === reqWallet) return true;

    // B5 Fix: System Admins CANNOT read or decrypt patient PHI clinical records!
    // Removed req.user.role === "admin"
    const provider = await store.providerByWallet(reqWallet);
    return !!(
      provider &&
      provider.status === "verified" &&
      (await store.hasActiveConsent(patient.id, provider.id, "records"))
    );
  };

  return {
    create: asyncHandler(async (req, res) => {
      const { patientId, recordType, clinicalData } = req.body || {};
      const patient = await store.patientById(patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!recordType || clinicalData === undefined) {
        return res
          .status(400)
          .json({ error: "recordType and clinicalData are required" });
      }

      const providerWallet = canonicalizeWallet(req.user.wallet);
      const provider = await store.providerByWallet(providerWallet);
      if (!provider || provider.status !== "verified") {
        return res
          .status(403)
          .json({ error: "Verified provider access required" });
      }

      if (!(await store.hasActiveConsent(patient.id, provider.id, "records"))) {
        return res
          .status(403)
          .json({ error: "Active patient consent required to create records" });
      }

      try {
        const recordId = crypto.randomUUID();
        const encrypted = process.env.NODE_ENV === "production"
          ? await envelopeEncryption.encryptField(patientId, {value: clinicalData}, {patientId, recordId, version:2})
          : encryption.encryptJson(clinicalData);
        const stored = await ipfs.uploadEncrypted(encrypted);

        const rawHash = crypto
          .createHash("sha256")
          .update(canonicalJsonStringify(encrypted))
          .digest("hex");
        const bytes32Hash = `0x${rawHash}`;

        let chainPatientId = chain.enabled
          ? await chain.patientId(patient.wallet)
          : null;

        if (chain.enabled && !chainPatientId) {
          throw new Error("Patient is not registered on chain");
        }

        if (chain.enabled) {
          await chain.addRecord(
            chainPatientId,
            provider.wallet,
            recordType,
            stored.cid,
            bytes32Hash
          );
        }

        const record = await store.addRecord({
          id: recordId,
          patientId,
          recordType: recordType.trim(),
          doctorId: provider.wallet,
          ipfsCid: stored.cid,
          encryptedHash: rawHash,
          createdAt: new Date().toISOString(),
        });

        await store.addAudit({
          id: crypto.randomUUID(),
          patientId,
          actor: provider.wallet,
          action: "RECORD_CREATED",
          recordId: record.id,
          providerId: provider.id,
          metadata: { recordType, chainPatientId },
          timestamp: new Date().toISOString(),
        });

        if (auditChain && auditChain.appendAuditEvent) {
          await auditChain.appendAuditEvent({
            id: record.id,
            patientId,
            actor: provider.wallet,
            action: "RECORD_CREATED",
            details: { recordType, chainPatientId, recordId: record.id },
          });
        }

        res.status(201).json(record);
      } catch (e) {
        console.error("Record creation error:", e);
        res.status(502).json({ error: "Secure record persistence failed" });
      }
    }),

    list: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!(await canRead(req, patient))) {
        return res
          .status(403)
          .json({ error: "Patient consent required for record access" });
      }

      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const records = await store.recordsForPatient(patient.id);
      res.json(records.slice(offset, offset + limit));
    }),

    detail: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!(await canRead(req, patient))) {
        return res
          .status(403)
          .json({ error: "Patient consent required for record access" });
      }

      const record = await store.recordById(patient.id, req.params.recordId);
      if (!record) return res.status(404).json({ error: "Record not found" });

      try {
        const encrypted = await ipfs.fetchEncrypted(record.ipfsCid);

        const computedHash = crypto
          .createHash("sha256")
          .update(canonicalJsonStringify(encrypted))
          .digest("hex");

        if (computedHash !== record.encryptedHash) {
          console.error("Payload hash mismatch for record", record.id);
          return res.status(500).json({ error: "Encrypted payload integrity check failed" });
        }

        if (encrypted.version === 2 && (encrypted.aad?.patientId !== patient.id || encrypted.aad?.recordId !== record.id)) {
          throw new Error("Record binding mismatch");
        }
        const clinicalData = encrypted.version === 2
          ? (await envelopeEncryption.decryptField(patient.id, encrypted)).value
          : encryption.decryptJson(encrypted);
        res.json({ ...record, clinicalData });
      } catch (e) {
        console.error("Record detail error:", e);
        res.status(502).json({ error: "Secure record retrieval failed" });
      }
    }),
  };
}

module.exports = { createRecordController, canonicalJsonStringify };
