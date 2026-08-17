module.exports = {
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  backendPrivateKey: process.env.BACKEND_PRIVATE_KEY || "",
  registryAddress: process.env.REGISTRY_ADDRESS || "",
  accessControlAddress: process.env.ACCESS_CONTROL_ADDRESS || "",
  recordsAddress: process.env.RECORDS_ADDRESS || "",
  auditAddress: process.env.AUDIT_ADDRESS || "",
  emergencyAddress: process.env.EMERGENCY_ADDRESS || ""
};
