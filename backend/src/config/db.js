const { Pool } = require("pg");
const {databaseOptions} = require("./databaseOptions");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const {subjectId} = require("../utils/identity");
const { AsyncLocalStorage } = require("node:async_hooks");
const transactions = new AsyncLocalStorage();

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
    userId: row.user_id || row.userId || null,
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
    userId: row.user_id || row.userId || null,
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


function createPool() {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    ...databaseOptions(),
    max: Number(process.env.DB_POOL_SIZE || (process.env.VERCEL ? 2 : 10)),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}

class PostgresStore {
  get inTransaction() {
    const context = transactions.getStore();
    return this._inTransaction || context?.pool === this.pool || context?.client === this.pool;
  }

  async transaction(work) {
    if (this.inTransaction) return work(this);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await transactions.run({pool:this.pool,client},
        () => work(new PostgresStore(client,true)));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
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
    this._inTransaction = inTransaction;
    this.pool = pool;
  }

  async query(q, p = []) {
    const context = transactions.getStore();
    const client = context && (context.pool===this.pool || context.client===this.pool) ? context.client : this.pool;
    return client.query(q,p);
  }

  async patientById(id) {
    if (!isValidUuid(id)) return null;
    const r = await this.query("SELECT * FROM patients WHERE id=$1", [id]);
    return normalizePatient(r.rows[0]);
  }

  async patientByWallet(wallet) {
    if (!wallet) return null;
    const w = wallet.toLowerCase();
    const r = await this.query("SELECT * FROM patients WHERE lower(wallet)=$1 OR user_id=$2", [w,subjectId(wallet)]);
    return r && r.rows && r.rows.length > 0 ? normalizePatient(r.rows[0]) : null;
  }

  async queryPage(sql, params, page, timeColumn, idColumn, normalize) {
    if (page.cursor && !isValidUuid(page.cursor.id)) {
      const error = new Error("Invalid pagination identifier");error.status=400;throw error;
    }
    const values = [...params];
    if (page.cursor) {
      values.push(page.cursor.time,page.cursor.id);
      sql += ` AND (${timeColumn},${idColumn}) < ($${values.length-1}::timestamptz,$${values.length}::uuid)`;
    }
    values.push(page.limit+1,page.offset);
    const result = await this.query(sql+` ORDER BY ${timeColumn} DESC,${idColumn} DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
    return result.rows.map(normalize);
  }

  listReviewsPage(page) {
    return this.queryPage("SELECT bge.* FROM break_glass_events bge LEFT JOIN break_glass_reviews bgr ON bgr.event_id=bge.id WHERE bgr.event_id IS NULL",[],page,"bge.created_at","bge.id",row=>row);
  }

  listPatientsPage(page) {
    return this.queryPage("SELECT id,wallet,created_at,(critical<>'{}'::jsonb) AS has_critical FROM patients WHERE true",[],page,"created_at","id",
      row=>({...normalizePatient(row),hasCriticalData:row.has_critical}));
  }

  listProvidersPage(status,page) {
    return this.queryPage("SELECT * FROM providers WHERE "+(status ? "status=$1" : "true"),status ? [status] : [],page,"created_at","id",normalizeProvider);
  }

  listRecordsPage(patientId,page) {
    return this.queryPage("SELECT * FROM records WHERE patient_id=$1",[patientId],page,"created_at","id",normalizeRecord);
  }

  listAuditPage(patientId,page) {
    return this.queryPage("SELECT * FROM audit_logs WHERE "+(patientId ? "patient_id=$1" : "true"),patientId ? [patientId] : [],page,"created_at","id",normalizeAudit);
  }

  listPatientConsentsPage(patientId,page) {
    return this.queryPage("SELECT c.*,p.wallet AS provider_wallet,p.name AS provider_name,p.specialty AS provider_specialty FROM patient_provider_consents c JOIN providers p ON p.id=c.provider_id WHERE c.patient_id=$1",
      [patientId],page,"c.granted_at","c.id",normalizeConsent);
  }

  listProviderConsentsPage(providerId,page) {
    return this.queryPage("SELECT c.*,pt.wallet AS patient_wallet,pt.profile AS patient_profile FROM patient_provider_consents c JOIN patients pt ON pt.id=c.patient_id WHERE c.provider_id=$1 AND c.status='active' AND (c.expires_at IS NULL OR c.expires_at>now())",
      [providerId],page,"c.granted_at","c.id",normalizeConsent);
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
      "INSERT INTO patients(id,wallet,profile,critical,created_at,critical_provenance,user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [x.id, w, JSON.stringify(x.profile || {}), JSON.stringify(x.critical || {}), x.createdAt, JSON.stringify(provenance),x.userId || (/^user:[a-f0-9-]{36}$/i.test(w) ? w.slice(5) : null)]
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

  async beginArchive(patientId,principal) {
    return this.transaction(async tx=>{
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const patient=await tx.patientById(patientId);
      if (!patient) throw new Error("Patient unavailable");
      const records=(await tx.query("SELECT id FROM records WHERE patient_id=$1 ORDER BY created_at,id LIMIT 20001",[patientId])).rows;
      const audits=(await tx.query("SELECT id FROM audit_logs WHERE patient_id=$1 ORDER BY created_at,id LIMIT 100001",[patientId])).rows;
      if (records.length>20000 || audits.length>100000) {
        const error=new Error("Use the hospital's assisted export process for this archive");error.status=413;throw error;
      }
      const id=require("crypto").randomUUID();
      return (await tx.query("INSERT INTO patient_archive_exports(id,patient_id,principal,revision,record_ids,audit_ids) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        [id,patientId,principal,patient.revision,JSON.stringify(records.map(row=>row.id)),JSON.stringify(audits.map(row=>row.id))])).rows[0];
    });
  }

  async archivePage(id, snapshot, recordOffset, auditOffset, limit) {
    const records = await this.query("SELECT * FROM records WHERE patient_id=$1 AND created_at<=$2 ORDER BY created_at,id LIMIT $3 OFFSET $4",[id,snapshot,limit+1,recordOffset]);
    const audit = await this.query("SELECT * FROM audit_logs WHERE patient_id=$1 AND created_at<=$2 ORDER BY created_at,id LIMIT $3 OFFSET $4",[id,snapshot,limit+1,auditOffset]);
    return {records:records.rows.map(normalizeRecord),audit:audit.rows.map(normalizeAudit)};
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
      "INSERT INTO records(id,patient_id,record_type,doctor_id,ipfs_cid,encrypted_hash,created_at,doctor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [x.id, x.patientId, x.recordType, x.doctorId, x.ipfsCid, x.encryptedHash, x.createdAt,x.doctorUserId || subjectId(x.doctorId)]
    );
    return normalizeRecord(r.rows[0]);
  }

  async addAudit(x) {
    const r = await this.query(
      "INSERT INTO audit_logs(id,patient_id,actor,action,record_id,provider_id,metadata,expires_at,created_at,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::uuid,(SELECT user_id FROM identities WHERE provider_type='wallet' AND identifier=$3 LIMIT 1))) RETURNING *",
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
        subjectId(x.actor),
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
    const r = await this.query("SELECT * FROM providers WHERE lower(wallet)=$1 OR user_id=$2", [w,subjectId(wallet)]);
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
      "INSERT INTO providers(id,wallet,name,license_number,specialty,status,created_at,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [x.id, w, x.name, x.licenseNumber, x.specialty, x.status, x.createdAt,x.userId || (/^user:[a-f0-9-]{36}$/i.test(w) ? w.slice(5) : null)]
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
      "SELECT c.*, pt.wallet as patient_wallet, pt.profile as patient_profile FROM patient_provider_consents c JOIN patients pt ON pt.id=c.patient_id WHERE c.provider_id=$1 AND c.status='active' AND (c.expires_at IS NULL OR c.expires_at>now()) ORDER BY c.granted_at DESC",
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
      "INSERT INTO sessions(id, wallet, token_hash, ip_address, user_agent, expires_at, created_at, mfa_verified,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [x.id, x.wallet, x.tokenHash, x.ipAddress || null, x.userAgent || null, x.expiresAt, x.createdAt || new Date().toISOString(), Boolean(x.mfaVerified),x.userId || null]
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
  async getKeyRecordById(patientId,keyId) {
    const row=(await this.query("SELECT * FROM key_registry WHERE patient_id=$1 AND key_id=$2",[patientId,keyId])).rows[0];
    return row ? {keyId:row.key_id,patientId:row.patient_id,encryptedDEK:row.encrypted_dek,status:row.status} : null;
  }

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
      "INSERT INTO audit_events(id, patient_id, actor, action, details, previous_hash, current_hash, created_at, actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::uuid,(SELECT user_id FROM identities WHERE provider_type='wallet' AND identifier=$3 LIMIT 1))) RETURNING *",
      [
        x.id,
        isValidUuid(x.patientId) ? x.patientId : null,
        canonicalizeWallet(x.actor),
        x.action,
        JSON.stringify(x.details || {}),
        x.previousHash,
        x.currentHash,
        x.createdAt || new Date().toISOString(),
        subjectId(x.actor),
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


async function createStore() {
  const pool=createPool();
  if (!pool) throw new Error("DATABASE_URL is required");
  try {await pool.query("SELECT 1");return new PostgresStore(pool);}
  catch {await pool.end();throw new Error("PostgreSQL connection unavailable");}
}

module.exports = {
  createStore,
  PostgresStore,
  canonicalizeWallet,
  normalizePatient,
  normalizeProvider,
  normalizeRecord,
  normalizeAudit,
  normalizeConsent,
};
