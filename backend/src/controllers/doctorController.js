function createDoctorController({ chain }) {
  return { access: async (_req, res) => res.json({ providerVerification: "required", chainMode: chain.enabled ? "configured" : "memory/client-wallet", permissions: ["read", "write", "emergency-critical-only"] }) };
}
module.exports = { createDoctorController };
