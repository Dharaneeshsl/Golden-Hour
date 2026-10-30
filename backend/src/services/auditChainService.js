const crypto = require("crypto");

/**
 * Hash-Chained Audit & Merkle Root Anchoring Service
 * 
 * - Computes forward-chained SHA-256 hashes: H_n = SHA256(H_{n-1} || payload)
 * - Detects tampering across any historical audit record
 * - Builds Merkle trees for blockchain anchoring (Option B)
 */

class AuditChainService {
  constructor() {
    this.genesisHash = "0000000000000000000000000000000000000000000000000000000000000000";
    this.chain = [];
  }

  getLatestHash() {
    if (this.chain.length === 0) return this.genesisHash;
    return this.chain[this.chain.length - 1].currentHash;
  }

  appendAuditEvent({ id, patientId, actor, action, details = {}, timestamp = new Date().toISOString() }) {
    const previousHash = this.getLatestHash();
    const payload = JSON.stringify({
      id,
      patientId,
      actor,
      action,
      details,
      timestamp,
      previousHash,
    });

    const currentHash = crypto.createHash("sha256").update(payload).digest("hex");
    const entry = {
      id: id || crypto.randomUUID(),
      sequenceNum: this.chain.length + 1,
      patientId,
      actor,
      action,
      details,
      previousHash,
      currentHash,
      timestamp,
    };

    this.chain.push(entry);
    return entry;
  }

  verifyChainIntegrity() {
    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];
      const expectedPrev = i === 0 ? this.genesisHash : this.chain[i - 1].currentHash;
      if (entry.previousHash !== expectedPrev) {
        return { valid: false, brokenAtSequence: entry.sequenceNum, reason: "Previous hash mismatch" };
      }

      const payload = JSON.stringify({
        id: entry.id,
        patientId: entry.patientId,
        actor: entry.actor,
        action: entry.action,
        details: entry.details,
        timestamp: entry.timestamp,
        previousHash: entry.previousHash,
      });

      const recalculated = crypto.createHash("sha256").update(payload).digest("hex");
      if (recalculated !== entry.currentHash) {
        return { valid: false, brokenAtSequence: entry.sequenceNum, reason: "Current hash recalculation failed" };
      }
    }
    return { valid: true, totalEntries: this.chain.length };
  }

  /**
   * Generates a Merkle Root from an array of audit hashes for on-chain anchoring
   */
  generateMerkleRoot(hashes = this.chain.map((c) => c.currentHash)) {
    if (hashes.length === 0) return this.genesisHash;
    let currentLevel = [...hashes];

    while (currentLevel.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        const combined = crypto.createHash("sha256").update(left + right).digest("hex");
        nextLevel.push(combined);
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }
}

module.exports = {
  AuditChainService,
  auditChain: new AuditChainService(),
};
