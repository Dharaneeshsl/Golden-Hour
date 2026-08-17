function listDoctorAccess(_req, res) { return res.json({ providerVerification: "required", permissions: ["read", "write", "emergency-critical-only"] }); }
module.exports = { listDoctorAccess };
