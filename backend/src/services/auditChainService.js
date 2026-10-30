const crypto = require("crypto");

/**
 * Hash-Chained Audit & Merkle Root Anchoring Service
 * 
 * - Computes forward-chained SHA-256 hashes: H_n = SHA256(H_{n-1} || payload)
 * - Persists audit events to database audit_events table
 * - Detects tampering across any historical audit record
 * - Builds Merkle trees for blockchain anchoring (Option B)
 */

class AuditChainService {
  constructor(store = null) {
    this.genesisHash = "0000000000000000000000000000000000000000000000000000000000000000";
    this.store = store;
    this.chain = [];
  }

  setStore(store) {
    this.store = store;
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
      createdAt: timestamp,
      timestamp,
    };

    if (this.store && this.store.addAuditEvent) {
      Promise.resolve(this.store.addAuditEvent(entry)).catch((err) =>
        console.warn("Audit events async save warning:", err.message)
      );
    }
    this.chain.push(entry);
    return entry;
  }

  verifyChainIntegrity(chainToVerify = this.chain) {
    for (let i = 0; i < chainToVerify.length; i++) {
      const entry = chainToVerify[i];
      const prevHash = entry.previousHash || entry.previous_hash;
      const curHash = entry.currentHash || entry.current_hash;
      const expectedPrev = i === 0 ? this.genesisHash : (chainToVerify[i - 1].currentHash || chainToVerify[i - 1].current_hash);
      
      if (prevHash !== expectedPrev) {
        return { valid: false, brokenAtSequence: entry.sequenceNum || entry.sequence_num, reason: "Previous hash mismatch" };
      }

      const payload = JSON.stringify({
        id: entry.id,
        patientId: entry.patientId || entry.patient_id,
        actor: entry.actor,
        action: entry.action,
        details: entry.details,
        timestamp: entry.createdAt || entry.created_at || entry.timestamp,
        previousHash: prevHash,
      });

      const recalculated = crypto.createHash("sha256").update(payload).digest("hex");
      if (recalculated !== curHash) {
        return { valid: false, brokenAtSequence: entry.sequenceNum || entry.sequence_num, reason: "Current hash recalculation failed" };
      }
    }
    return { valid: true, totalEntries: chainToVerify.length };
  }

  generateMerkleRoot(hashes = this.chain.map((c) => c.currentHash || c.current_hash)) {
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

const auditChain = new AuditChainService();

module.exports = {
  AuditChainService,
  auditChain,
};
