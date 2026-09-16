const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function canonicalizeWallet(wallet) {
  if (!wallet) return wallet;
  try {
    return ethers.getAddress(wallet);
  } catch (e) {
    return wallet.toLowerCase();
  }
}

function createPool() {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DB_POOL_SIZE || 10),
  });
}

class PostgresStore {
  constructor(pool) {
    this.pool = pool;
  }

  async query(q, p = []) {
    return this.pool.query(q, p);
  }

  async patientById(id) {
    return (await this.query("SELECT * FROM patients WHERE id=$1", [id])).rows[0];
  }

  async patientByWallet(wallet) {
    return (
      await this.query("SELECT * FROM patients WHERE lower(wallet)=lower($1)", [
        wallet,
      ])
    ).rows[0];
  }

  async allPatients() {
    return (await this.query("SELECT id, wallet, profile, created_at FROM patients ORDER BY created_at DESC")).rows;
  }

  async addPatient(x) {
    const w = canonicalizeWallet(x.wallet);
    return (
      await this.query(
        "INSERT INTO patients(id,wallet,profile,critical,created_at) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [x.id, w, x.profile, x.critical, x.createdAt]
      )
    ).rows[0];
  }

  async updatePatient(id, patch) {
    const current = await this.patientById(id);
    if (!current) return null;
    const newProfile = patch.profile ? { ...current.profile, ...patch.profile } : current.profile;
    const newCritical = patch.critical ? { ...current.critical, ...patch.critical } : current.critical;
    return (
      await this.query(
        "UPDATE patients SET profile=$2, critical=$3 WHERE id=$1 RETURNING *",
        [id, newProfile, newCritical]
      )
    ).rows[0];
  }

  async recordsForPatient(id) {
    return (
      await this.query(
        "SELECT * FROM records WHERE patient_id=$1 ORDER BY created_at DESC",
        [id]
      )
    ).rows;
  }

  async recordById(patientId, recordId) {
    return (
      await this.query(
        "SELECT * FROM records WHERE patient_id=$1 AND id=$2",
        [patientId, recordId]
      )
    ).rows[0];
  }

  async addRecord(x) {
    return (
      await this.query(
        "INSERT INTO records(id,patient_id,record_type,doctor_id,ipfs_cid,encrypted_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          x.id,
          x.patientId,
          x.recordType,
          x.doctorId,
          x.ipfsCid,
          x.encryptedHash,
          x.createdAt,
        ]
      )
    ).rows[0];
  }

  async addAudit(x) {
    return (
      await this.query(
        "INSERT INTO audit_logs(id,patient_id,actor,action,record_id,provider_id,metadata,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          x.id,
          x.patientId || null,
          x.actor,
          x.action,
          x.recordId || null,
          x.providerId || null,
          JSON.stringify(x.metadata || {}),
          x.expiresAt || null,
          x.timestamp || new Date().toISOString(),
        ]
      )
    ).rows[0];
  }

  async auditForPatient(id) {
    return (
      await this.query(
        "SELECT * FROM audit_logs WHERE patient_id=$1 ORDER BY created_at DESC",
        [id]
      )
    ).rows;
  }

  async recentAudits(limit = 50) {
    return (
      await this.query(
        "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1",
        [limit]
      )
    ).rows;
  }

  async auditById(id) {
    return (
      await this.query("SELECT * FROM audit_logs WHERE id=$1", [id])
    ).rows[0];
  }

  async providerByWallet(wallet) {
    return (
      await this.query(
        "SELECT * FROM providers WHERE lower(wallet)=lower($1)",
        [wallet]
      )
    ).rows[0];
  }

  async providerById(id) {
    return (
      await this.query("SELECT * FROM providers WHERE id=$1", [id])
    ).rows[0];
  }

  async providers(status) {
    return (
      await this.query(
        status
          ? "SELECT * FROM providers WHERE status=$1 ORDER BY created_at DESC"
          : "SELECT * FROM providers ORDER BY created_at DESC",
        status ? [status] : []
      )
    ).rows;
  }

  async addProvider(x) {
    const w = canonicalizeWallet(x.wallet);
    return (
      await this.query(
        "INSERT INTO providers(id,wallet,name,license_number,specialty,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [x.id, w, x.name, x.licenseNumber, x.specialty, x.status, x.createdAt]
      )
    ).rows[0];
  }

  async grantConsent(x) {
    const r = await this.query(
      "INSERT INTO patient_provider_consents(id,patient_id,provider_id,status,scope,granted_at) VALUES($1,$2,$3,'active',$4,$5) ON CONFLICT(patient_id,provider_id) DO UPDATE SET status='active',scope=EXCLUDED.scope,granted_at=EXCLUDED.granted_at,revoked_at=null RETURNING *",
      [x.id, x.patientId, x.providerId, JSON.stringify(x.scope), x.grantedAt]
    );
    return r.rows[0];
  }

  async revokeConsent(patientId, providerId) {
    const r = await this.query(
      "UPDATE patient_provider_consents SET status='revoked',revoked_at=now() WHERE patient_id=$1 AND provider_id=$2 AND status='active' RETURNING *",
      [patientId, providerId]
    );
    return r.rows[0];
  }

  async hasActiveConsent(patientId, providerId, scope) {
    const r = await this.query(
      "SELECT scope FROM patient_provider_consents WHERE patient_id=$1 AND provider_id=$2 AND status='active'",
      [patientId, providerId]
    );
    return !!r.rows.find(
      (x) => Array.isArray(x.scope) && x.scope.includes(scope)
    );
  }

  async consentsForPatient(id) {
    return (
      await this.query(
        "SELECT c.*, p.wallet as provider_wallet, p.name as provider_name, p.specialty as provider_specialty FROM patient_provider_consents c JOIN providers p ON p.id=c.provider_id WHERE c.patient_id=$1 ORDER BY c.granted_at DESC",
        [id]
      )
    ).rows;
  }

  async consentsForProvider(providerId) {
    return (
      await this.query(
        "SELECT c.*, pt.wallet as patient_wallet, pt.profile as patient_profile FROM patient_provider_consents c JOIN patients pt ON pt.id=c.patient_id WHERE c.provider_id=$1 AND c.status='active' ORDER BY c.granted_at DESC",
        [providerId]
      )
    ).rows;
  }

  async updateProvider(wallet, patch) {
    const r = await this.query(
      "UPDATE providers SET status=$2, verified_by=$3, verified_at=$4, updated_at=now() WHERE lower(wallet)=lower($1) RETURNING *",
      [wallet, patch.status, patch.verifiedBy || null, patch.verifiedAt || null]
    );
    return r.rows[0];
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
    return this.state.patients.find((x) => x.id === id);
  }

  async patientByWallet(w) {
    return this.state.patients.find(
      (x) => x.wallet.toLowerCase() === w.toLowerCase()
    );
  }

  async allPatients() {
    return this.state.patients.map(({ id, wallet, profile, createdAt }) => ({
      id,
      wallet,
      profile,
      created_at: createdAt,
    }));
  }

  async addPatient(x) {
    const entry = { ...x, wallet: canonicalizeWallet(x.wallet) };
    this.state.patients.push(entry);
    this.save();
    return entry;
  }

  async updatePatient(id, patch) {
    const x = await this.patientById(id);
    if (!x) return null;
    if (patch.profile) x.profile = { ...x.profile, ...patch.profile };
    if (patch.critical) x.critical = { ...x.critical, ...patch.critical };
    this.save();
    return x;
  }

  async recordsForPatient(id) {
    return this.state.records
      .filter((x) => x.patientId === id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async recordById(patientId, recordId) {
    return this.state.records.find(
      (x) => x.patientId === patientId && x.id === recordId
    );
  }

  async addRecord(x) {
    this.state.records.push(x);
    this.save();
    return x;
  }

  async addAudit(x) {
    const entry = {
      ...x,
      timestamp: x.timestamp || new Date().toISOString(),
      created_at: x.timestamp || new Date().toISOString(),
    };
    this.state.audit.push(entry);
    this.save();
    return entry;
  }

  async auditForPatient(id) {
    return this.state.audit
      .filter((x) => x.patientId === id)
      .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));
  }

  async recentAudits(limit = 50) {
    return this.state.audit
      .slice()
      .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt))
      .slice(0, limit);
  }

  async auditById(id) {
    return this.state.audit.find((x) => x.id === id);
  }

  async providerByWallet(w) {
    return this.state.providers.find(
      (x) => x.wallet.toLowerCase() === w.toLowerCase()
    );
  }

  async providerById(id) {
    return this.state.providers.find((x) => x.id === id);
  }

  async providers(status) {
    return this.state.providers
      .filter((x) => !status || x.status === status)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async addProvider(x) {
    const entry = { ...x, wallet: canonicalizeWallet(x.wallet) };
    this.state.providers.push(entry);
    this.save();
    return entry;
  }

  async grantConsent(x) {
    this.state.consents = this.state.consents || [];
    const e = this.state.consents.find(
      (v) => v.patientId === x.patientId && v.providerId === x.providerId
    );
    if (e) {
      Object.assign(e, x, { status: "active", revokedAt: null });
    } else {
      this.state.consents.push({ ...x, status: "active" });
    }
    this.save();
    return e || x;
  }

  async revokeConsent(patientId, providerId) {
    const x = (this.state.consents || []).find(
      (v) =>
        v.patientId === patientId &&
        v.providerId === providerId &&
        v.status === "active"
    );
    if (!x) return null;
    x.status = "revoked";
    x.revokedAt = new Date().toISOString();
    this.save();
    return x;
  }

  async hasActiveConsent(patientId, providerId, scope) {
    const x = (this.state.consents || []).find(
      (v) =>
        v.patientId === patientId &&
        v.providerId === providerId &&
        v.status === "active"
    );
    return !!x && Array.isArray(x.scope) && x.scope.includes(scope);
  }

  async consentsForPatient(id) {
    return (this.state.consents || [])
      .filter((v) => v.patientId === id)
      .map((v) => {
        const p = this.state.providers.find((x) => x.id === v.providerId);
        return {
          ...v,
          providerWallet: p?.wallet,
          providerName: p?.name,
          providerSpecialty: p?.specialty,
        };
      });
  }

  async consentsForProvider(providerId) {
    return (this.state.consents || [])
      .filter((v) => v.providerId === providerId && v.status === "active")
      .map((v) => {
        const pt = this.state.patients.find((x) => x.id === v.patientId);
        return {
          ...v,
          patientWallet: pt?.wallet,
          patientProfile: pt?.profile,
        };
      });
  }

  async updateProvider(w, p) {
    const x = await this.providerByWallet(w);
    if (!x) return null;
    Object.assign(x, p);
    this.save();
    return x;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const t = this.file + ".tmp";
    fs.writeFileSync(t, JSON.stringify(this.state, null, 2));
    fs.renameSync(t, this.file);
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
  await pool.query("SELECT 1");
  return new PostgresStore(pool);
}

module.exports = { createStore, PostgresStore, JsonStore, canonicalizeWallet };
