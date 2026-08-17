function createEmergencyController({ store, chain }) {
  return {
    create: async (req, res) => {
      const { patientId, justification } = req.body || {}; const patient = store.patientById(patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!justification || justification.length < 10) return res.status(400).json({ error: "A justification of at least 10 characters is required" });
      let chainResult = { mode: "memory", status: "chain-not-configured" };
      try { chainResult = await chain.triggerEmergency(patientId, justification); } catch (error) { return res.status(502).json({ error: "Blockchain emergency access failed", detail: error.shortMessage || error.message }); }
      const event = store.addAudit({ patientId: String(patientId), doctorId: req.user.wallet, justification, scope: "EMERGENCY_CRITICAL_ONLY", timestamp: new Date().toISOString(), chain: chainResult });
      return res.json({ patientId: String(patientId), critical: patient.critical, audit: event, chain: chainResult });
    },
    audit: (req, res) => res.json(store.auditForPatient(req.params.patientId))
  };
}
module.exports = { createEmergencyController };
