const crypto = require("crypto");

function createRecordController({ store, encryption, ipfs, chain }) {
  const canRead = async (req, patient, provider = req.provider) => {
    if (req.user.role === "admin" || patient.wallet.toLowerCase() === req.user.wallet.toLowerCase()) return true;
    const currentProvider = provider || (await store.providerByWallet(req.user.wallet));
    return !!(
      currentProvider &&
      currentProvider.status === "verified" &&
      (await store.hasActiveConsent(patient.id, currentProvider.id, "records"))
    );
  };

  return {
    create: async (req, res) => {
      const { patientId, recordType, clinicalData } = req.body || {};
      const patient = await store.patientById(patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!recordType || clinicalData === undefined) {
        return res.status(400).json({ error: "recordType and clinicalData are required" });
      }

      // requireVerifiedProvider middleware already resolved the live provider.
      const provider = req.provider;
      if (!provider || provider.status !== "verified") {
        return res.status(403).json({ error: "Verified provider access required" });
      }
      if (!(await store.hasActiveConsent(patient.id, provider.id, "records"))) {
        return res.status(403).json({ error: "Active patient consent required to create records" });
      }

      try {
        const encrypted = encryption.encryptJson(clinicalData);
        const stored = await ipfs.uploadEncrypted(encrypted);
        const encryptedHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(encrypted))
          .digest("hex");
        const chainPatientId = chain.enabled ? await chain.patientId(patient.wallet) : null;
        if (chain.enabled && !chainPatientId) throw new Error("Patient is not registered on chain");
        if (chain.enabled) {
          await chain.addRecord(
            chainPatientId,
            provider.wallet,
            recordType,
            stored.cid,
            `0x${encryptedHash}`.padEnd(66, "0")
          );
        }
        const record = await store.addRecord({
          id: crypto.randomUUID(),
          patientId,
          recordType,
          doctorId: provider.wallet,
          ipfsCid: stored.cid,
          encryptedHash,
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
        res.status(502).json({ error: "Secure record persistence failed", details: e.message });
      }
    },

    list: async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!(await canRead(req, patient))) {
        return res.status(403).json({ error: "Patient consent required for record access" });
      }
      res.json(await store.recordsForPatient(patient.id));
    },

    detail: async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!(await canRead(req, patient))) {
        return res.status(403).json({ error: "Patient consent required for record access" });
      }
      const record = await store.recordById(patient.id, req.params.recordId);
      if (!record) return res.status(404).json({ error: "Record not found" });
      try {
        const encrypted = await ipfs.fetchEncrypted(record.ipfsCid);
        const clinicalData = encryption.decryptJson(encrypted);
        res.json({ ...record, clinicalData });
      } catch (e) {
        res.status(502).json({ error: "Secure record retrieval failed", details: e.message });
      }
    },
  };
}

module.exports = { createRecordController };
