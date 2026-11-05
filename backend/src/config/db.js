const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function isValidUuid(id) {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function canonicalizeWallet(wallet) {
  if (!wallet) return wallet;
  try {
    return ethers.getAddress(wallet);
  } catch (e) {
    return wallet.toLowerCase();
  }
}

function normalizePatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    wallet: canonicalizeWallet(row.wallet),
    profile: typeof row.profile === "string" ? JSON.parse(row.profile) : (row.profile || {}),
    revision: row.revision || 1,
    criticalProvenance: row.critical_provenance || row.criticalProvenance || {},
    summaryUpdatedAt: row.summary_updated_at || row.summaryUpdatedAt || null,
    critical: typeof row.critical === "string" ? JSON.parse(row.critical) : (row.critical || {}),
    createdAt: row.created_at || row.createdAt,
  };
}

function normalizeProvider(row) {
  if (!row) return null;
  return {
    id: row.id,
    wallet: canonicalizeWallet(row.wallet),
    name: row.name,
    licenseNumber: row.license_number || row.licenseNumber,
    specialty: row.specialty,
    status: row.status,
    verifiedBy: row.verified_by ? canonicalizeWallet(row.verified_by) : (row.verifiedBy ? canonicalizeWallet(row.verifiedBy) : null),
    verifiedAt: row.verified_at || row.verifiedAt || null,
    createdAt: row.created_at || row.createdAt,
  };
}

function normalizeRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id || row.patientId,
    recordType: row.record_type || row.recordType,
    doctorId: row.doctor_id || row.doctorId,
    doctorWallet: row.doctor_id || row.doctorId || row.doctorWallet,
    ipfsCid: row.ipfs_cid || row.ipfsCid,
    encryptedHash: row.encrypted_hash || row.encryptedHash,
    createdAt: row.created_at || row.createdAt,
  };
}

function normalizeAudit(row) {
  if (!row) return null;
  const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {});
  return {
    id: row.id,
    patientId: row.patient_id || row.patientId || null,
    actor: canonicalizeWallet(row.actor),
    action: row.action,
    recordId: row.record_id || row.recordId || null,
    providerId: row.provider_id || row.providerId || null,
    metadata,
    expiresAt: row.expires_at || row.expiresAt || null,
    timestamp: row.created_at || row.timestamp || row.createdAt,
    createdAt: row.created_at || row.createdAt,
  };
}

function normalizeConsent(row) {
  if (!row) return null;
  const scope = typeof row.scope === "string" ? JSON.parse(row.scope) : (row.scope || ["records"]);
  return {
    id: row.id,
    patientId: row.patient_id || row.patientId,
    providerId: row.provider_id || row.providerId,
    status: row.status,
    scope,
    purpose: row.purpose || "EMERGENCY_TREATMENT",
    expiresAt: row.expires_at || row.expiresAt || null,
    grantedAt: row.granted_at || row.grantedAt,
    revokedAt: row.revoked_at || row.revokedAt || null,
    providerWallet: row.provider_wallet ? canonicalizeWallet(row.provider_wallet) : (row.providerWallet ? canonicalizeWallet(row.providerWallet) : undefined),
    providerName: row.provider_name || row.providerName || undefined,
    providerSpecialty: row.provider_specialty || row.providerSpecialty || undefined,
    patientWallet: row.patient_wallet ? canonicalizeWallet(row.patient_wallet) : (row.patientWallet ? canonicalizeWallet(row.patientWallet) : undefined),
    patientProfile: row.patient_profile ? (typeof row.patient_profile === "string" ? JSON.parse(row.patient_profile) : row.patient_profile) : (row.patientProfile || undefined),
  };
}

function getDbSslConfig() {
  if (process.env.DB_SSL !== "true") return undefined;
  const ca = process.env.DB_CA_PEM || (process.env.DB_CA ? fs.readFileSync(process.env.DB_CA,"utf8") : undefined);
  if (process.env.NODE_ENV === "production" && (!ca || process.env.DB_REJECT_UNAUTHORIZED === "false")) {
    throw new Error("Production database connections require verified TLS and a CA certificate");
  }
  return {rejectUnauthorized:process.env.DB_REJECT_UNAUTHORIZED !== "false", ...(ca ? {ca} : {})};
}

function createPool() {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getDbSslConfig(),
    max: Number(process.env.DB_POOL_SIZE || (process.env.VERCEL ? 2 : 10)),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}

class PostgresStore {
  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PostgresStore(client, true));
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async emergencyQuota(wallet, max) {
    const result = await this.query(
      `INSERT INTO emergency_quota(wallet,requests,started_at) VALUES ($1,1,now())
       ON CONFLICT(wallet) DO UPDATE SET
         requests=CASE WHEN emergency_quota.started_at <= now()-interval '15 minutes' THEN 1 ELSE emergency_quota.requests+1 END,
         started_at=CASE WHEN emergency_quota.started_at <= now()-interval '15 minutes' THEN now() ELSE emergency_quota.started_at END
       WHERE emergency_quota.requests < $2 OR emergency_quota.started_at <= now()-interval '15 minutes'
       RETURNING requests`, [wallet,max]);
    return result.rowCount === 1;
  }

  async replaceCard(id, hash) {
    await this.query("INSERT INTO emergency_cards(patient_id,token_hash) VALUES ($1,$2) ON CONFLICT(patient_id) DO UPDATE SET token_hash=EXCLUDED.token_hash", [id,hash]);
  }

  async cardPatient(hash) {
    return (await this.query("SELECT patient_id FROM emergency_cards WHERE token_hash=$1", [hash])).rows[0]?.patient_id;
  }

  async rotateRefresh(id, oldHash, newHash) {
    const result = await this.query("UPDATE sessions SET token_hash=$3 WHERE id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at > now()", [id,oldHash,newHash]);
    return result.rowCount === 1;
  }

  async saveChallenge(wallet, message, expiresAt) {
    await this.query("DELETE FROM login_challenges WHERE expires_at <= now()");
    await this.query("INSERT INTO login_challenges(wallet,message,expires_at) VALUES ($1,$2,$3) ON CONFLICT (wallet) DO UPDATE SET message=EXCLUDED.message,expires_at=EXCLUDED.expires_at", [wallet,message,expiresAt]);
  }

  async getChallenge(wallet) {
    return (await this.query("SELECT message FROM login_challenges WHERE wallet=$1 AND expires_at > now()", [wallet])).rows[0];
  }

  async consumeChallenge(wallet, message) {
    return (await this.query("DELETE FROM login_challenges WHERE wallet=$1 AND message=$2 AND expires_at > now()", [wallet,message])).rowCount === 1;
  }

  constructor(pool, inTransaction = false) {
    this.inTransaction = inTransaction;
    this.pool = pool;
  }

  async query(q, p = []) {
    return this.pool.query(q, p);
  }

  async patientById(id) {
    if (!isValidUuid(id)) return null;
    const r = await this.query("SELECT * FROM patients WHERE id=$1", [id]);
    return normalizePatient(r.rows[0]);
  }

  async patientByWallet(wallet) {
    if (!wallet) return null;
    const w = wallet.toLowerCase();
    const r = await this.query("SELECT * FROM patients WHERE lower(wallet)=$1", [w]);
    return r && r.rows && r.rows.length > 0 ? normalizePatient(r.rows[0]) : null;
  }

  async allPatients() {
    const r = await this.query("SELECT * FROM patients ORDER BY created_at DESC");
    return r.rows.map(normalizePatient);
  }

  async addPatient(x) {
    const w = canonicalizeWallet(x.wallet);
    const provenance = Object.fromEntries(Object.keys(x.critical || {}).map(field =>
      [field,{source:"Patient reported",author:w,updatedAt:x.createdAt}]));
    const r = await this.query(
      "INSERT INTO patients(id,wallet,profile,critical,created_at,critical_provenance) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [x.id, w, JSON.stringify(x.profile || {}), JSON.stringify(x.critical || {}), x.createdAt, JSON.stringify(provenance)]
    );
    return normalizePatient(r.rows[0]);
  }

  async updatePatient(id, patch) {
    if (!isValidUuid(id)) return null;
    const current = await this.patientById(id);
    if (!current) return null;
    const newProfile = patch.profile ? { ...current.profile, ...patch.profile } : current.profile;
    const newCritical = patch.critical ? { ...current.critical, ...patch.critical } : current.critical;
    const provenance = {...current.criticalProvenance};
    for (const field of Object.keys(patch.critical || {})) {
      provenance[field] = {source:"Patient reported",author:current.wallet,updatedAt:new Date().toISOString()};
    }
    const r = await this.query(
      "UPDATE patients SET profile=$2, critical=$3, critical_provenance=$6, revision=revision+1, summary_updated_at=CASE WHEN $5 THEN now() ELSE summary_updated_at END WHERE id=$1 AND revision=$4 RETURNING *",
      [id, JSON.stringify(newProfile), JSON.stringify(newCritical), patch.revision, Boolean(patch.critical), JSON.stringify(provenance)]
    );
    return normalizePatient(r.rows[0]);
  }

  async recordsForPatient(id) {
    if (!isValidUuid(id)) return [];
    const r = await this.query("SELECT * FROM records WHERE patient_id=$1 ORDER BY created_at DESC", [id]);
    return r.rows.map(normalizeRecord);
  }

  async recordById(patientId, recordId) {
    if (!isValidUuid(patientId) || !isValidUuid(recordId)) return null;
    const r = await this.query("SELECT * FROM records WHERE patient_id=$1 AND id=$2", [patientId, recordId]);
    return normalizeRecord(r.rows[0]);
  }

  async addRecord(x) {
    const r = await this.query(
      "INSERT INTO records(id,patient_id,record_type,doctor_id,ipfs_cid,encrypted_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [x.id, x.patientId, x.recordType, x.doctorId, x.ipfsCid, x.encryptedHash, x.createdAt]
    );
    return normalizeRecord(r.rows[0]);
  }

  async addAudit(x) {
    const r = await this.query(
      "INSERT INTO audit_logs(id,patient_id,actor,action,record_id,provider_id,metadata,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [
        x.id,
        isValidUuid(x.patientId) ? x.patientId : null,
        canonicalizeWallet(x.actor),
        x.action,
        isValidUuid(x.recordId) ? x.recordId : null,
        isValidUuid(x.providerId) ? x.providerId : null,
        JSON.stringify(x.metadata || {}),
        x.expiresAt || null,
        x.timestamp || new Date().toISOString(),
      ]
    );
    return normalizeAudit(r.rows[0]);
  }

  async auditForPatient(id) {
    if (!isValidUuid(id)) return [];
    const r = await this.query("SELECT * FROM audit_logs WHERE patient_id=$1 ORDER BY created_at DESC", [id]);
    return r.rows.map(normalizeAudit);
  }

  async recentAudits(limit = 50) {
    const r = await this.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1", [limit]);
    return r.rows.map(normalizeAudit);
  }

  async auditById(id) {
    if (!isValidUuid(id)) return null;
    const r = await this.query("SELECT * FROM audit_logs WHERE id=$1", [id]);
    return normalizeAudit(r.rows[0]);
  }

  async providerByWallet(wallet) {
    if (!wallet) return null;
    const w = wallet.toLowerCase();
    const r = await this.query("SELECT * FROM providers WHERE lower(wallet)=$1", [w]);
    return r && r.rows && r.rows.length > 0 ? normalizeProvider(r.rows[0]) : null;
  }

  async providerById(id) {
    if (!isValidUuid(id)) return null;
    const r = await this.query("SELECT * FROM providers WHERE id=$1", [id]);
    return normalizeProvider(r.rows[0]);
  }

  async providers(status) {
    const r = await this.query(
      status
        ? "SELECT * FROM providers WHERE status=$1 ORDER BY created_at DESC"
        : "SELECT * FROM providers ORDER BY created_at DESC",
      status ? [status] : []
    );
    return r.rows.map(normalizeProvider);
  }

  async addProvider(x) {
    const w = canonicalizeWallet(x.wallet);
    const r = await this.query(
      "INSERT INTO providers(id,wallet,name,license_number,specialty,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [x.id, w, x.name, x.licenseNumber, x.specialty, x.status, x.createdAt]
    );
    return normalizeProvider(r.rows[0]);
  }

  async grantConsent(x) {
    const r = await this.query(
      "INSERT INTO patient_provider_consents(id,patient_id,provider_id,status,scope,granted_at,purpose,expires_at) VALUES($1,$2,$3,'active',$4,$5,$6,$7) ON CONFLICT(patient_id,provider_id) DO UPDATE SET status='active',scope=EXCLUDED.scope,granted_at=EXCLUDED.granted_at,purpose=EXCLUDED.purpose,expires_at=EXCLUDED.expires_at,revoked_at=null RETURNING *",
      [x.id, x.patientId, x.providerId, JSON.stringify(x.scope), x.grantedAt, x.purpose, x.expiresAt || null]
    );
    return normalizeConsent(r.rows[0]);
  }

  async revokeConsent(patientId, providerId) {
    const r = await this.query(
      "UPDATE patient_provider_consents SET status='revoked',revoked_at=now() WHERE patient_id=$1 AND provider_id=$2 AND status='active' RETURNING *",
      [patientId, providerId]
    );
    return normalizeConsent(r.rows[0]);
  }

  async hasActiveConsent(patientId, providerId, scope) {
    const r = await this.query(
      "SELECT scope, expires_at FROM patient_provider_consents WHERE patient_id=$1 AND provider_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at > now())",
      [patientId, providerId]
    );
    return !!r.rows.find((x) => {
      const s = typeof x.scope === "string" ? JSON.parse(x.scope) : x.scope;
      return Array.isArray(s) && s.includes(scope);
    });
  }

  async consentsForPatient(id) {
    const r = await this.query(
      "SELECT c.*, p.wallet as provider_wallet, p.name as provider_name, p.specialty as provider_specialty FROM patient_provider_consents c JOIN providers p ON p.id=c.provider_id WHERE c.patient_id=$1 ORDER BY c.granted_at DESC",
      [id]
    );
    return r.rows.map(normalizeConsent);
  }

  async consentsForProvider(providerId) {
    const r = await this.query(
      "SELECT c.*, pt.wallet as patient_wallet, pt.profile as patient_profile FROM patient_provider_consents c JOIN patients pt ON pt.id=c.patient_id WHERE c.provider_id=$1 AND c.status='active' ORDER BY c.granted_at DESC",
      [providerId]
    );
    return r.rows.map(normalizeConsent);
  }

  async updateProvider(wallet, patch) {
    const r = await this.query(
      "UPDATE providers SET status=$2, verified_by=$3, verified_at=$4, updated_at=now() WHERE lower(wallet)=lower($1) RETURNING *",
      [wallet, patch.status, patch.verifiedBy || null, patch.verifiedAt || null]
    );
    return normalizeProvider(r.rows[0]);
  }
  // --- Sessions (B11) ---
  async createSession(x) {
    const r = await this.query(
      "INSERT INTO sessions(id, wallet, token_hash, ip_address, user_agent, expires_at, created_at, mfa_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [x.id, x.wallet, x.tokenHash, x.ipAddress || null, x.userAgent || null, x.expiresAt, x.createdAt || new Date().toISOString(), Boolean(x.mfaVerified)]
    );
    return r.rows[0];
  }

  async getSessionByHash(tokenHash) {
    const r = await this.query("SELECT * FROM sessions WHERE token_hash=$1", [tokenHash]);
    return r.rows[0] || null;
  }

  async revokeSession(id) {
    const r = await this.query("UPDATE sessions SET revoked_at=now() WHERE id=$1 RETURNING *", [id]);
    return r.rows[0] || null;
  }

  async isSessionActive(id) {
    if (!id || !isValidUuid(id)) return false;
    const r = await this.query("SELECT id, expires_at, revoked_at FROM sessions WHERE id=$1", [id]);
    if (!r.rows[0]) return false;
    const s = r.rows[0];
    if (s.revoked_at) return false;
    return new Date(s.expires_at) > new Date();
  }

  // --- Key Registry for KMS Envelope Encryption (B2, B3) ---
  async getKeyRecord(patientId) {
    if (!isValidUuid(patientId)) return null;
    const r = await this.query(
      "SELECT * FROM key_registry WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 1",
      [patientId]
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return {
      keyId: row.key_id,
      patientId: row.patient_id,
      algorithm: row.algorithm,
      encryptedDEK: row.encrypted_dek,
      status: row.status,
      rotatedAt: row.rotated_at,
      createdAt: row.created_at,
    };
  }

  async saveKeyRecord(x) {
    const r = await this.query(
      "INSERT INTO key_registry(key_id, patient_id, algorithm, encrypted_dek, status, created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [x.keyId, x.patientId, x.algorithm || "aes-256-gcm", x.encryptedDEK, x.status || "active", x.createdAt || new Date().toISOString()]
    );
    const row = r.rows[0];
    return {
      keyId: row.key_id,
      patientId: row.patient_id,
      algorithm: row.algorithm,
      encryptedDEK: row.encrypted_dek,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async shredKeyRecord(patientId) {
    if (!isValidUuid(patientId)) return null;
    const r = await this.query(
      "UPDATE key_registry SET status='shredded', encrypted_dek='[CRYPTO_SHREDDED_PERMANENTLY_DESTROYED]', rotated_at=now() WHERE patient_id=$1 RETURNING *",
      [patientId]
    );
    return r.rows.map((row) => ({
      keyId: row.key_id,
      patientId: row.patient_id,
      status: row.status,
    }));
  }

  // --- Break-Glass Events & Post-Hoc Compliance Reviews (B6, B7) ---
  async addBreakGlassEvent(x) {
    const r = await this.query(
      "INSERT INTO break_glass_events(id, patient_id, doctor_id, reason_code, justification, facility, expires_at, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [x.id, x.patientId, x.doctorId, x.reasonCode, x.justification, x.facility, x.expiresAt, x.createdAt || new Date().toISOString()]
    );
    return r.rows[0];
  }

  async getPendingBreakGlassReviews(limit = 50, offset = 0) {
    const r = await this.query(
      `SELECT bge.*, bgr.decision, bgr.reviewer_id, bgr.notes, bgr.created_at as reviewed_at
       FROM break_glass_events bge
       LEFT JOIN break_glass_reviews bgr ON bgr.event_id = bge.id
       WHERE bgr.event_id IS NULL ORDER BY bge.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return r.rows;
  }

  async addBreakGlassReview(x) {
    const r = await this.query(
      "INSERT INTO break_glass_reviews(id, event_id, reviewer_id, decision, notes, created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO NOTHING RETURNING *",
      [x.id, x.eventId, x.reviewerId, x.decision, x.notes || null, x.createdAt || new Date().toISOString()]
    );
    return r.rows[0];
  }

  // --- Hash-Chained Append-Only Audit Log (Step 4 Audit) ---
  async addAuditEvent(x) {
    const r = await this.query(
      "INSERT INTO audit_events(id, patient_id, actor, action, details, previous_hash, current_hash, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [
        x.id,
        isValidUuid(x.patientId) ? x.patientId : null,
        canonicalizeWallet(x.actor),
        x.action,
        JSON.stringify(x.details || {}),
        x.previousHash,
        x.currentHash,
        x.createdAt || new Date().toISOString(),
      ]
    );
    return r.rows[0];
  }

  async getLastAuditEvent() {
    const r = await this.query(
      "SELECT * FROM audit_events ORDER BY sequence_num DESC LIMIT 1"
    );
    return r.rows[0] || null;
  }

  async getAuditEvents(patientId, limit = 50, offset = 0) {
    const sql = patientId
      ? "SELECT * FROM audit_events WHERE patient_id=$1 ORDER BY sequence_num ASC LIMIT $2 OFFSET $3"
      : "SELECT * FROM audit_events ORDER BY sequence_num ASC LIMIT $1 OFFSET $2";
    const params = patientId ? [patientId, limit, offset] : [limit, offset];
    const r = await this.query(sql, params);
    return r.rows;
  }

  // --- Transactional Outbox (B13) ---
  async addOutboxItem(x) {
    const r = await this.query(
      "INSERT INTO outbox(id, topic, payload, status, retries, created_at) VALUES($1,$2,$3,'pending',0,$4) RETURNING *",
      [x.id, x.topic, JSON.stringify(x.payload || {}), x.createdAt || new Date().toISOString()]
    );
    return r.rows[0];
  }

  async claimOutboxItems(limit = 10) {
    await this.query("UPDATE outbox SET status='failed',lease_until=NULL WHERE status='processing' AND lease_until<=now() AND retries>=5");
    const result = await this.query(
      `WITH candidates AS (
        SELECT id FROM outbox WHERE retries<5 AND
          ((status='pending' AND available_at<=now()) OR (status='processing' AND lease_until<=now()))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1
       )
       UPDATE outbox SET status='processing',retries=retries+1,lease_token=gen_random_uuid(),
         lease_until=now()+interval '60 seconds'
       WHERE id IN (SELECT id FROM candidates) RETURNING *`,[limit]);
    return result.rows;
  }

  async getPendingOutboxItems(limit = 10) {
    const r = await this.query(
      "SELECT * FROM outbox WHERE status='pending' AND retries < 5 ORDER BY created_at ASC LIMIT $1",
      [limit]
    );
    return r.rows.map((row) => ({
      ...row,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    }));
  }

  async markOutboxItemCompleted(id, leaseToken) {
    const result = await this.query("UPDATE outbox SET status='sent',lease_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2 AND status='processing' RETURNING *",[id,leaseToken]);
    return result.rows[0];
  }

  async markOutboxItemFailed(id, _message, leaseToken) {
    const result = await this.query(
      `UPDATE outbox SET status=CASE WHEN retries>=5 THEN 'failed' ELSE 'pending' END,
       available_at=now()+least(300,power(2,retries))*interval '1 second',
       lease_until=NULL,last_error='Delivery unconfirmed'
       WHERE id=$1 AND lease_token=$2 AND status='processing' RETURNING *`,[id,leaseToken]);
    return result.rows[0];
  }

}

class JsonStore {
  replaceCard(id, hash) {
    this.state.cards ??= {};
    this.state.cards[id] = hash;
    this.save();
  }

  cardPatient(hash) {
    return Object.keys(this.state.cards || {}).find(id => this.state.cards[id] === hash);
  }

  rotateRefresh(id, oldHash, newHash) {
    const session = this.state.sessions?.find(s => s.id === id && s.tokenHash === oldHash);
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) return false;
    session.tokenHash = newHash;
    this.save();
    return true;
  }

  challenges = new Map();

  saveChallenge(wallet, message, expiresAt) {
    for (const [key, entry] of this.challenges) {
      if (Date.parse(entry.expiresAt) <= Date.now()) this.challenges.delete(key);
    }
    this.challenges.set(wallet, {message, expiresAt});
  }

  getChallenge(wallet) {
    const entry = this.challenges.get(wallet);
    return entry && Date.parse(entry.expiresAt) > Date.now() ? entry : null;
  }

  consumeChallenge(wallet, message) {
    return this.getChallenge(wallet)?.message === message && this.challenges.delete(wallet);
  }

  constructor(
    file = process.env.DATA_FILE ||
      (fs.existsSync(path.join(process.cwd(), ".data", "goldenhour.json"))
        ? path.join(process.cwd(), ".data", "goldenhour.json")
        : path.join(__dirname, "../../.data", "goldenhour.json"))
  ) {
    this.file = file;
    this.state = {
      patients: [],
      records: [],
      audit: [],
      providers: [],
      consents: [],
    };
    if (file !== ":memory:" && fs.existsSync(file)) {
      try {
        this.state = { ...this.state, ...JSON.parse(fs.readFileSync(file, "utf8")) };
      } catch (e) {
        console.error("Warning: Failed to parse JsonStore file, initializing empty state", e);
      }
    }
  }

  async patientById(id) {
    return normalizePatient(this.state.patients.find((x) => x.id === id));
  }

  async patientByWallet(w) {
    if (!w) return null;
    return normalizePatient(
      this.state.patients.find(
        (x) => x.wallet.toLowerCase() === w.toLowerCase()
      )
    );
  }

  async allPatients() {
    return this.state.patients.map(normalizePatient);
  }

  async addPatient(x) {
    const criticalProvenance = Object.fromEntries(Object.keys(x.critical || {}).map(field =>
      [field,{source:"Patient reported",author:canonicalizeWallet(x.wallet),updatedAt:x.createdAt}]));
    const entry = normalizePatient({ ...x, criticalProvenance, wallet: canonicalizeWallet(x.wallet) });
    this.state.patients.push(entry);
    this.save();
    return entry;
  }

  async updatePatient(id, patch) {
    const index = this.state.patients.findIndex((x) => x.id === id);
    if (index === -1) return null;
    const x = this.state.patients[index];
    if ((x.revision || 1) !== patch.revision) return null;
    x.revision = (x.revision || 1) + 1;
    if (patch.critical) {
      x.summaryUpdatedAt = new Date().toISOString();
      x.criticalProvenance ??= {};
      for (const field of Object.keys(patch.critical)) {
        x.criticalProvenance[field] = {source:"Patient reported",author:x.wallet,updatedAt:x.summaryUpdatedAt};
      }
    }
    if (patch.profile) x.profile = { ...x.profile, ...patch.profile };
    if (patch.critical) x.critical = { ...x.critical, ...patch.critical };
    this.save();
    return normalizePatient(x);
  }

  async recordsForPatient(id) {
    return this.state.records
      .filter((x) => x.patientId === id || x.patient_id === id)
      .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
      .map(normalizeRecord);
  }

  async recordById(patientId, recordId) {
    const r = this.state.records.find(
      (x) => (x.patientId === patientId || x.patient_id === patientId) && x.id === recordId
    );
    return normalizeRecord(r);
  }

  async addRecord(x) {
    const entry = normalizeRecord(x);
    this.state.records.push(entry);
    this.save();
    return entry;
  }

  async addAudit(x) {
    const entry = normalizeAudit({
      ...x,
      timestamp: x.timestamp || new Date().toISOString(),
      createdAt: x.createdAt || x.timestamp || new Date().toISOString(),
    });
    this.state.audit.push(entry);
    this.save();
    return entry;
  }

  async auditForPatient(id) {
    return this.state.audit
      .filter((x) => x.patientId === id || x.patient_id === id)
      .sort((a, b) => new Date(b.timestamp || b.createdAt || b.created_at) - new Date(a.timestamp || a.createdAt || a.created_at))
      .map(normalizeAudit);
  }

  async recentAudits(limit = 50) {
    return this.state.audit
      .slice()
      .sort((a, b) => new Date(b.timestamp || b.createdAt || b.created_at) - new Date(a.timestamp || a.createdAt || a.created_at))
      .slice(0, limit)
      .map(normalizeAudit);
  }

  async auditById(id) {
    const r = this.state.audit.find((x) => x.id === id);
    if (!r) return null;
    return normalizeAudit(r);
  }

  async providerByWallet(w) {
    if (!w) return null;
    return normalizeProvider(
      this.state.providers.find(
        (x) => x.wallet.toLowerCase() === w.toLowerCase()
      )
    );
  }

  async providerById(id) {
    return normalizeProvider(this.state.providers.find((x) => x.id === id));
  }

  async providers(status) {
    return this.state.providers
      .filter((x) => !status || x.status === status)
      .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
      .map(normalizeProvider);
  }

  async addProvider(x) {
    const entry = normalizeProvider({ ...x, wallet: canonicalizeWallet(x.wallet) });
    this.state.providers.push(entry);
    this.save();
    return entry;
  }

  async grantConsent(x) {
    this.state.consents = this.state.consents || [];
    const e = this.state.consents.find(
      (v) => (v.patientId === x.patientId || v.patient_id === x.patientId) && (v.providerId === x.providerId || v.provider_id === x.providerId)
    );
    if (e) {
      Object.assign(e, x, { status: "active", revokedAt: null });
    } else {
      this.state.consents.push({ ...x, status: "active" });
    }
    this.save();
    return normalizeConsent(e || x);
  }

  async revokeConsent(patientId, providerId) {
    const x = (this.state.consents || []).find(
      (v) =>
        (v.patientId === patientId || v.patient_id === patientId) &&
        (v.providerId === providerId || v.provider_id === providerId) &&
        v.status === "active"
    );
    if (!x) return null;
    x.status = "revoked";
    x.revokedAt = new Date().toISOString();
    this.save();
    return normalizeConsent(x);
  }

  async hasActiveConsent(patientId, providerId, scope) {
    const x = (this.state.consents || []).find(
      (v) =>
        (v.patientId === patientId || v.patient_id === patientId) &&
        (v.providerId === providerId || v.provider_id === providerId) &&
        v.status === "active"
    );
    if (!x) return false;
    const now = new Date();
    if (x.expiresAt && new Date(x.expiresAt) <= now) return false;
    if (x.expires_at && new Date(x.expires_at) <= now) return false;
    const s = typeof x.scope === 'string' ? JSON.parse(x.scope) : x.scope;
    return Array.isArray(s) && s.includes(scope);
  }

  async consentsForPatient(id) {
    return (this.state.consents || [])
      .filter((v) => v.patientId === id || v.patient_id === id)
      .map((v) => {
        const p = this.state.providers.find((x) => x.id === (v.providerId || v.provider_id));
        return normalizeConsent({
          ...v,
          provider_wallet: p?.wallet,
          provider_name: p?.name,
          provider_specialty: p?.specialty,
        });
      });
  }

  async consentsForProvider(providerId) {
    return (this.state.consents || [])
      .filter((v) => (v.providerId === providerId || v.provider_id === providerId) && v.status === "active")
      .map((v) => {
        const pt = this.state.patients.find((x) => x.id === (v.patientId || v.patient_id));
        return normalizeConsent({
          ...v,
          patient_wallet: pt?.wallet,
          patient_profile: pt?.profile,
        });
      });
  }

  async updateProvider(w, p) {
    const index = this.state.providers.findIndex((x) => x.wallet.toLowerCase() === w.toLowerCase());
    if (index === -1) return null;
    const x = this.state.providers[index];
    Object.assign(x, p);
    this.save();
    return normalizeProvider(x);
  }
  // --- Sessions (B11) ---
  async createSession(x) {
    this.state.sessions = this.state.sessions || [];
    const session = { ...x, createdAt: x.createdAt || new Date().toISOString() };
    this.state.sessions.push(session);
    this.save();
    return session;
  }

  async getSessionByHash(tokenHash) {
    this.state.sessions = this.state.sessions || [];
    return this.state.sessions.find((s) => s.tokenHash === tokenHash) || null;
  }

  async revokeSession(id) {
    this.state.sessions = this.state.sessions || [];
    const session = this.state.sessions.find((s) => s.id === id);
    if (session) {
      session.revokedAt = new Date().toISOString();
      this.save();
    }
    return session || null;
  }

  async isSessionActive(id) {
    this.state.sessions = this.state.sessions || [];
    const s = this.state.sessions.find((x) => x.id === id);
    if (!s || s.revokedAt) return false;
    return new Date(s.expiresAt) > new Date();
  }

  // --- Key Registry (B2, B3) ---
  async getKeyRecord(patientId) {
    this.state.keys = this.state.keys || [];
    const records = this.state.keys.filter((k) => k.patientId === patientId);
    return records.length > 0 ? records[records.length - 1] : null;
  }

  async saveKeyRecord(x) {
    this.state.keys = this.state.keys || [];
    const record = { ...x, createdAt: x.createdAt || new Date().toISOString() };
    this.state.keys.push(record);
    this.save();
    return record;
  }

  async shredKeyRecord(patientId) {
    this.state.keys = this.state.keys || [];
    const records = this.state.keys.filter((k) => k.patientId === patientId);
    for (const r of records) {
      r.status = "shredded";
      r.encryptedDEK = "[CRYPTO_SHREDDED_PERMANENTLY_DESTROYED]";
      r.rotatedAt = new Date().toISOString();
    }
    this.save();
    return records;
  }

  // --- Break-Glass & Reviews (B6, B7) ---
  async addBreakGlassEvent(x) {
    this.state.breakGlassEvents = this.state.breakGlassEvents || [];
    const event = { ...x, createdAt: x.createdAt || new Date().toISOString() };
    this.state.breakGlassEvents.push(event);
    this.save();
    return event;
  }

  async getPendingBreakGlassReviews(limit = 50, offset = 0) {
    this.state.breakGlassEvents = this.state.breakGlassEvents || [];
    this.state.breakGlassReviews = this.state.breakGlassReviews || [];
    const reviewedEventIds = new Set(this.state.breakGlassReviews.map((r) => r.eventId));
    return this.state.breakGlassEvents
      .filter((e) => !reviewedEventIds.has(e.id))
      .slice(offset, offset + limit);
  }

  async addBreakGlassReview(x) {
    this.state.breakGlassReviews = this.state.breakGlassReviews || [];
    if (this.state.breakGlassReviews.some(r => r.eventId === x.eventId)) return null;
    const review = { ...x, createdAt: x.createdAt || new Date().toISOString() };
    this.state.breakGlassReviews.push(review);
    this.save();
    return review;
  }

  // --- Audit Events (Step 4 Audit) ---
  async addAuditEvent(x) {
    this.state.auditEvents = this.state.auditEvents || [];
    const event = { ...x, sequenceNum: this.state.auditEvents.length + 1, createdAt: x.createdAt || new Date().toISOString() };
    this.state.auditEvents.push(event);
    this.save();
    return event;
  }

  async getLastAuditEvent() {
    this.state.auditEvents = this.state.auditEvents || [];
    return this.state.auditEvents.length > 0
      ? this.state.auditEvents[this.state.auditEvents.length - 1]
      : null;
  }

  async getAuditEvents(patientId, limit = 50, offset = 0) {
    this.state.auditEvents = this.state.auditEvents || [];
    const events = patientId
      ? this.state.auditEvents.filter((e) => e.patientId === patientId)
      : this.state.auditEvents;
    return events.slice(offset, offset + limit);
  }

  // --- Transactional Outbox (B13) ---
  async addOutboxItem(x) {
    this.state.outbox = this.state.outbox || [];
    const item = { ...x, status: "pending", retries: 0, createdAt: x.createdAt || new Date().toISOString() };
    this.state.outbox.push(item);
    this.save();
    return item;
  }

  async getPendingOutboxItems(limit = 10) {
    this.state.outbox = this.state.outbox || [];
    return this.state.outbox
      .filter((i) => i.status === "pending" && i.retries < 5)
      .slice(0, limit);
  }

  async markOutboxItemCompleted(id) {
    this.state.outbox = this.state.outbox || [];
    const item = this.state.outbox.find((i) => i.id === id);
    if (item) {
      item.status = "sent";
      this.save();
    }
    return item;
  }

  async markOutboxItemFailed(id, error) {
    this.state.outbox = this.state.outbox || [];
    const item = this.state.outbox.find((i) => i.id === id);
    if (item) {
      item.retries = (item.retries || 0) + 1;
      if (item.retries >= 5) item.status = "failed";
      item.lastError = error;
      this.save();
    }
    return item;
  }

  save(itemToUpdate) {
    if (this.file === ":memory:") return itemToUpdate;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (itemToUpdate && itemToUpdate.id) {
      const auditIdx = this.state.audit.findIndex((a) => a.id === itemToUpdate.id);
      if (auditIdx !== -1) {
        this.state.audit[auditIdx] = { ...this.state.audit[auditIdx], ...itemToUpdate };
      }
    }
    const t = this.file + ".tmp";
    fs.writeFileSync(t, JSON.stringify(this.state, null, 2));
    fs.renameSync(t, this.file);
    return itemToUpdate;
  }
}

async function createStore() {
  const pool = createPool();
  if (!pool) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_INSECURE_LOCAL_STORE !== "true"
    ) {
      throw new Error(
        "DATABASE_URL is missing. Insecure local JsonStore is disabled in production unless ALLOW_INSECURE_LOCAL_STORE=true is set."
      );
    }
    return new JsonStore();
  }
  try {
    await pool.query("SELECT 1");
    return new PostgresStore(pool);
  } catch (err) {
    if (process.env.NODE_ENV === "production" || process.env.ALLOW_INSECURE_LOCAL_STORE !== "true") {
      throw new Error(`PostgreSQL database connection failed in secure environment: ${err.message}`);
    }
    console.error("Warning: PostgreSQL database connection failed, falling back to JsonStore:", err.message);
    return new JsonStore();
  }
}

module.exports = {
  createStore,
  PostgresStore,
  JsonStore,
  canonicalizeWallet,
  normalizePatient,
  normalizeProvider,
  normalizeRecord,
  normalizeAudit,
  normalizeConsent,
};
