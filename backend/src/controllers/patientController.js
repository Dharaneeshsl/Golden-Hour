function createPatientController({ store, chain }) {
  return {
    create: async (req, res) => {
      const wallet = req.body.wallet || req.user.wallet;
      const { profile, critical } = req.body || {};
      if (!wallet || !profile || !critical) return res.status(400).json({ error: "wallet, profile and critical are required" });
      if (store.patientByWallet(wallet)) return res.status(409).json({ error: "Patient already registered" });
      const patient = store.addPatient({ id: String(store.state.patients.length + 1), wallet, profile, critical, createdAt: new Date().toISOString() });
      let chainResult = { mode: "memory", status: "client-wallet-required" };
      try { chainResult = await chain.registerPatient(profile, critical); } catch (error) { return res.status(502).json({ error: "Blockchain registration failed", detail: error.shortMessage || error.message }); }
      return res.status(201).json({ ...patient, chain: chainResult });
    },
    get: (req, res) => { const patient = store.patientById(req.params.id); if (!patient) return res.status(404).json({ error: "Patient not found" }); return res.json({ ...patient, records: store.recordsForPatient(patient.id), audit: store.auditForPatient(patient.id) }); }
  };
}
module.exports = { createPatientController };
