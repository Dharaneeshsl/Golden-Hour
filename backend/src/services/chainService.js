const { ethers } = require("ethers");
const config = require("../config/contractConfig");
const registryAbi = ["function registerPatient(bytes32,bytes32) returns (uint256)", "function getPatientId(address) view returns (uint256)"];
const recordsAbi = ["function addRecord(uint256,string,string,bytes32)"];
const emergencyAbi = ["function triggerEmergencyAccess(uint256,string)"];
const auditAbi = ["function getAuditTrail(uint256) view returns (tuple(uint256 patientId,address accessor,string reason,string scope,uint64 timestamp)[])"];
function hashText(value) { return ethers.id(String(value)); }
class ChainService {
  constructor(options = {}) {
    this.config = { ...config, ...options };
    this.enabled = Boolean(this.config.rpcUrl && this.config.backendPrivateKey && this.config.registryAddress);
    if (this.enabled) {
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      this.signer = new ethers.Wallet(this.config.backendPrivateKey, this.provider);
      this.registry = new ethers.Contract(this.config.registryAddress, registryAbi, this.signer);
      this.records = this.config.recordsAddress ? new ethers.Contract(this.config.recordsAddress, recordsAbi, this.signer) : null;
      this.emergency = this.config.emergencyAddress ? new ethers.Contract(this.config.emergencyAddress, emergencyAbi, this.signer) : null;
      this.audit = this.config.auditAddress ? new ethers.Contract(this.config.auditAddress, auditAbi, this.provider) : null;
    }
  }
  async registerPatient(profile, critical) { if (!this.enabled) return { mode: "memory", status: "client-wallet-required" }; const tx = await this.registry.registerPatient(hashText(profile), hashText(critical)); return { mode: "chain", txHash: tx.hash, receipt: await tx.wait() }; }
  async addRecord(patientId, type, cid, encryptedHash) { if (!this.records) return { mode: "memory", status: "chain-not-configured" }; const tx = await this.records.addRecord(patientId, type, cid, encryptedHash); return { mode: "chain", txHash: tx.hash, receipt: await tx.wait() }; }
  async triggerEmergency(patientId, justification) { if (!this.emergency) return { mode: "memory", status: "chain-not-configured" }; const tx = await this.emergency.triggerEmergencyAccess(patientId, justification); return { mode: "chain", txHash: tx.hash, receipt: await tx.wait() }; }
  async patientId(wallet) { if (!this.registry) return null; const id = await this.registry.getPatientId(wallet); return id === 0n ? null : id.toString(); }
  async auditTrail(patientId) { if (!this.audit) return []; return this.audit.getAuditTrail(patientId); }
}
module.exports = { ChainService, hashText };
