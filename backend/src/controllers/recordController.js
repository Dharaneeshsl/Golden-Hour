const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");

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

function createRecordController({ store, encryption, ipfs, chain }) {
  const canRead = async (req, patient) => {
    const reqWallet = canonicalizeWallet(req.user.wallet);
    const patientWallet = canonicalizeWallet(patient.wallet);

    if (req.user.role === "admin" || patientWallet === reqWallet) return true;

    const provider = await store.providerByWallet(reqWallet);
    return !!(
      provider &&
      provider.status === "verified" &&
      (await store.hasActiveConsent(patient.id, provider.id, "records"))
    );
  };

  return {
    create: async (req, res) => {
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
        const encrypted = encryption.encryptJson(clinicalData);
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
          id: crypto.randomUUID(),
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

        res.status(201).json(record);
      } catch (e) {
        console.error("Record creation error:", e);
        res.status(502).json({ error: "Secure record persistence failed" });
      }
    },

    list: async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!(await canRead(req, patient))) {
        return res
          .status(403)
          .json({ error: "Patient consent required for record access" });
      }

      res.json(await store.recordsForPatient(patient.id));
    },

    detail: async (req, res) => {
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

        const clinicalData = encryption.decryptJson(encrypted);
        res.json({ ...record, clinicalData });
      } catch (e) {
        console.error("Record detail error:", e);
        res.status(502).json({ error: "Secure record retrieval failed" });
      }
    },
  };
}

module.exports = { createRecordController, canonicalJsonStringify };