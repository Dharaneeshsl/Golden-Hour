function validateEmergencyRequest(req, res, next) { const { patientId, doctorId, justification } = req.body || {}; if (!patientId || !doctorId || !justification || justification.length < 10) return res.status(400).json({ error: "A patient, doctor and justification of at least 10 characters are required" }); next(); }
module.exports = { validateEmergencyRequest };
