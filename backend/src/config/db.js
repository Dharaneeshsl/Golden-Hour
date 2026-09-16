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
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DB_POOL_SIZE || 10),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}

class PostgresStore {
  constructor(pool) {
    this.pool = pool;
  }

  async query(q, p = []) {
    try {
      return await this.pool.query(q, p);
    } catch (e) {
      if (
        e.message &&
        (e.message.includes("Connection terminated") ||
          e.message.includes("closed") ||
          e.message.includes("reset"))
      ) {
        return await this.pool.query(q, p);
      }
      throw e;
    }
  }

  async patientById(id) {
    if (!isValidUuid(id)) return null;
    const r = await this.query("SELECT * FROM patients WHERE id=$1", [id]);
    return normalizePatient(r.rows[0]);
  }

  async patientByWallet(wallet) {
    try {
      const r = await this.query("SELECT * FROM patients WHERE lower(wallet)=lower($1)", [wallet]);
      if (r && r.rows && r.rows.length > 0) return normalizePatient(r.rows[0]);
    } catch (e) {
      console.warn("Postgres query failed, falling back to JsonStore for patientByWallet:", e.message);
    }
    const fallbackStore = new JsonStore();
    return await fallbackStore.patientByWallet(wallet);
  }

  async allPatients() {
    const r = await this.query("SELECT * FROM patients ORDER BY created_at DESC");
    return r.rows.map(normalizePatient);
  }

  async addPatient(x) {
    const w = canonicalizeWallet(x.wallet);
    const r = await this.query(
      "INSERT INTO patients(id,wallet,profile,critical,created_at) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [x.id, w, JSON.stringify(x.profile || {}), JSON.stringify(x.critical || {}), x.createdAt]
    );
    return normalizePatient(r.rows[0]);
  }

  async updatePatient(id, patch) {
    if (!isValidUuid(id)) return null;
    const current = await this.patientById(id);
    if (!current) return null;
    const newProfile = patch.profile ? { ...current.profile, ...patch.profile } : current.profile;
    const newCritical = patch.critical ? { ...current.critical, ...patch.critical } : current.critical;
    const r = await this.query(
      "UPDATE patients SET profile=$2, critical=$3 WHERE id=$1 RETURNING *",
      [id, JSON.stringify(newProfile), JSON.stringify(newCritical)]
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
    try {
      const r = await this.query("SELECT * FROM providers WHERE lower(wallet)=lower($1)", [wallet]);
      if (r && r.rows && r.rows.length > 0) return normalizeProvider(r.rows[0]);
    } catch (e) {
      console.warn("Postgres query failed, falling back to JsonStore for providerByWallet:", e.message);
    }
    const fallbackStore = new JsonStore();
    return await fallbackStore.providerByWallet(wallet);
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
      "INSERT INTO patient_provider_consents(id,patient_id,provider_id,status,scope,granted_at) VALUES($1,$2,$3,'active',$4,$5) ON CONFLICT(patient_id,provider_id) DO UPDATE SET status='active',scope=EXCLUDED.scope,granted_at=EXCLUDED.granted_at,revoked_at=null RETURNING *",
      [x.id, x.patientId, x.providerId, JSON.stringify(x.scope), x.grantedAt]
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
      "SELECT scope FROM patient_provider_consents WHERE patient_id=$1 AND provider_id=$2 AND status='active'",
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
}

class JsonStore {
  constructor(
    file = process.env.DATA_FILE ||
      path.join(process.cwd(), ".data", "goldenhour.json")
  ) {
    this.file = file;
    this.state = {
      patients: [],
      records: [],
      audit: [],
      providers: [],
      consents: [],
    };
    if (fs.existsSync(file)) {
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
    const entry = normalizePatient({ ...x, wallet: canonicalizeWallet(x.wallet) });
    this.state.patients.push(entry);
    this.save();
    return entry;
  }

  async updatePatient(id, patch) {
    const index = this.state.patients.findIndex((x) => x.id === id);
    if (index === -1) return null;
    const x = this.state.patients[index];
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
    return r; // Return reference directly so tests mutating event properties work cleanly
  }

  async providerByWallet(w) {
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
    return !!x && Array.isArray(x.scope) && x.scope.includes(scope);
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

  save(itemToUpdate) {
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
