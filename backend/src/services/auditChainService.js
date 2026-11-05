const crypto = require("crypto");

function sortAuditValue(value) {
  if (Array.isArray(value)) return value.map(sortAuditValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key,sortAuditValue(value[key])]));
}

function canonicalAuditPayload(id, patientId, actor, action, details, timestamp, previousHash) {
  const ts = timestamp instanceof Date ? timestamp.toISOString() : (timestamp ? new Date(timestamp).toISOString() : new Date().toISOString());
  const det = typeof details === "string" ? JSON.parse(details) : (details || {});
  return JSON.stringify({
    id: String(id),
    patientId: patientId ? String(patientId) : null,
    actor: String(actor || "").toLowerCase(),
    action: String(action),
    details: det._hashEncoding === "canonical-json-v2" ? sortAuditValue(det) : det,
    timestamp: ts,
    previousHash: String(previousHash),
  });
}

/**
 * Hash-Chained Audit & Merkle Root Anchoring Service
 * 
 * - Computes forward-chained SHA-256 hashes: H_n = SHA256(H_{n-1} || payload)
 * - Persists audit events to database audit_events table with awaited transactions
 * - Detects tampering across persisted audit history
 * - Builds Merkle trees from database-persisted events for blockchain anchoring
 */
class AuditChainService {
  constructor(store = null) {
    this.genesisHash = "0000000000000000000000000000000000000000000000000000000000000000";
    this.store = store;
    this.memoryChain = [];
  }

  setStore(store) {
    this.store = store;
  }

  async getLatestHash() {
    if (this.store && this.store.getLastAuditEvent) {
      const last = await this.store.getLastAuditEvent();
      if (last && (last.current_hash || last.currentHash)) {
        return last.current_hash || last.currentHash;
      }
    } else if (this.memoryChain.length > 0) {
      const last = this.memoryChain[this.memoryChain.length - 1];
      return last.currentHash || last.current_hash;
    }
    return this.genesisHash;
  }

  async appendAuditEvent({ id, patientId, actor, action, details = {}, timestamp = new Date().toISOString() }) {
    if (process.env.NODE_ENV === "production" && this.store?.transaction) {
      if (!this.store.inTransaction) {
        return this.store.transaction(tx => new AuditChainService(tx).appendAuditEvent({id, patientId, actor, action, details, timestamp}));
      }
      await this.store.query("SELECT pg_advisory_xact_lock(849204820)");
    }
    details = {...details,_hashEncoding:"canonical-json-v2"};
    const eventId = id || crypto.randomUUID();
    const isoTimestamp = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
    const previousHash = await this.getLatestHash();

    const payload = canonicalAuditPayload(
      eventId,
      patientId,
      actor,
      action,
      details,
      isoTimestamp,
      previousHash
    );

    const currentHash = crypto.createHash("sha256").update(payload).digest("hex");
    const entry = {
      id: eventId,
      patientId: patientId || null,
      actor,
      action,
      details,
      previousHash,
      currentHash,
      previous_hash: previousHash,
      current_hash: currentHash,
      createdAt: isoTimestamp,
      created_at: isoTimestamp,
      timestamp: isoTimestamp,
    };

    let saved = entry;
    if (this.store && this.store.addAuditEvent) {
      saved = await this.store.addAuditEvent(entry);
    } else {
      this.memoryChain.push(entry);
    }

    return {
      id: saved.id || entry.id,
      patientId: saved.patient_id !== undefined ? saved.patient_id : (saved.patientId !== undefined ? saved.patientId : entry.patientId),
      actor: saved.actor || entry.actor,
      action: saved.action || entry.action,
      details: saved.details || entry.details,
      previousHash: saved.previous_hash || saved.previousHash || entry.previousHash,
      currentHash: saved.current_hash || saved.currentHash || entry.currentHash,
      previous_hash: saved.previous_hash || saved.previousHash || entry.previousHash,
      current_hash: saved.current_hash || saved.currentHash || entry.currentHash,
      createdAt: saved.created_at || saved.createdAt || entry.createdAt,
      timestamp: saved.created_at || saved.createdAt || entry.createdAt,
    };
  }

  async verifyChainIntegrity(patientId = null) {
    let chainToVerify = [];
    if (this.store && this.store.getAuditEvents) {
      for (let offset=0;;offset+=1000) {
        const page = await this.store.getAuditEvents(null,1000,offset);
        chainToVerify.push(...page);
        if (page.length<1000) break;
      }
    } else {
      chainToVerify = this.memoryChain;
    }

    for (let i = 0; i < chainToVerify.length; i++) {
      const entry = chainToVerify[i];
      const prevHash = entry.previousHash || entry.previous_hash;
      const curHash = entry.currentHash || entry.current_hash;
      const expectedPrev = i === 0 ? this.genesisHash : (chainToVerify[i - 1].currentHash || chainToVerify[i - 1].current_hash);

      if (prevHash !== expectedPrev) {
        return {
          valid: false,
          brokenAtSequence: entry.sequenceNum || entry.sequence_num || i + 1,
          reason: "Previous hash mismatch",
        };
      }

      const payload = canonicalAuditPayload(
        entry.id,
        entry.patientId || entry.patient_id,
        entry.actor,
        entry.action,
        entry.details,
        entry.createdAt || entry.created_at || entry.timestamp,
        prevHash
      );

      const recalculated = crypto.createHash("sha256").update(payload).digest("hex");
      if (recalculated !== curHash) {
        return {
          valid: false,
          brokenAtSequence: entry.sequenceNum || entry.sequence_num || i + 1,
          reason: "Current hash recalculation failed",
        };
      }
    }
    return { valid: true, totalEntries: chainToVerify.length };
  }

  async generateMerkleRoot(patientId = null) {
    let hashes = [];
    if (this.store && this.store.getAuditEvents) {
      const events = await this.store.getAuditEvents(patientId, 1000, 0);
      hashes = events.map((c) => c.currentHash || c.current_hash);
    } else {
      const events = patientId
        ? this.memoryChain.filter((e) => e.patientId === patientId || e.patient_id === patientId)
        : this.memoryChain;
      hashes = events.map((c) => c.currentHash || c.current_hash);
    }

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
  canonicalAuditPayload,
};
