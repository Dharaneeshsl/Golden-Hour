const crypto = require("crypto");
function createRecordController({ store, chain, encryption, ipfs }) {
  return {
    create: async (req, res) => {
      const { patientId, recordType, clinicalData } = req.body || {};
      if (!patientId || !recordType || !clinicalData) return res.status(400).json({ error: "patientId, recordType and clinicalData are required" });
      if (!store.patientById(patientId)) return res.status(404).json({ error: "Patient not found" });
      const encrypted = encryption.encryptJson(clinicalData); const stored = await ipfs.uploadEncrypted(encrypted);
      const encryptedHash = crypto.createHash("sha256").update(JSON.stringify(encrypted)).digest("hex");
      const record = store.addRecord({ id: String(store.state.records.length + 1), patientId: String(patientId), recordType, doctorId: req.user.wallet, ipfsCid: stored.cid, encryptedHash, createdAt: new Date().toISOString() });
      let chainResult = { mode: "memory", status: "chain-not-configured" };
      try { chainResult = await chain.addRecord(patientId, recordType, stored.cid, `0x${encryptedHash.padEnd(64, "0").slice(0, 64)}`); } catch (error) { return res.status(502).json({ error: "Blockchain record write failed", detail: error.shortMessage || error.message }); }
      return res.status(201).json({ ...record, chain: chainResult });
    },
    list: (req, res) => res.json(store.recordsForPatient(req.params.patientId))
  };
}
module.exports = { createRecordController };
