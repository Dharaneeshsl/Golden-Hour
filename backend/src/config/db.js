const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

function createPool() {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DB_POOL_SIZE || 10),
  });
}

const PATIENT_COLUMNS = `
  id,
  wallet,
  profile,
  critical,
  created_at AS "createdAt"
`;

const RECORD_COLUMNS = `
  id,
  patient_id AS "patientId",
  record_type AS "recordType",
  doctor_id AS "doctorId",
  ipfs_cid AS "ipfsCid",
  encrypted_hash AS "encryptedHash",
  created_at AS "createdAt"
`;

const AUDIT_COLUMNS = `
  id,
  patient_id AS "patientId",
  actor,
  action,
  record_id AS "recordId",
  provider_id AS "providerId",
  metadata,
  expires_at AS "expiresAt",
  created_at AS "timestamp"
`;

const PROVIDER_COLUMNS = `
  id,
  wallet,
  name,
  license_number AS "licenseNumber",
  specialty,
  status,
  verified_by AS "verifiedBy",
  verified_at AS "verifiedAt",
  updated_at AS "updatedAt",
  created_at AS "createdAt"
`;

const CONSENT_COLUMNS = `
  c.id,
  c.patient_id AS "patientId",
  c.provider_id AS "providerId",
  c.status,
  c.scope,
  c.granted_at AS "grantedAt",
  c.revoked_at AS "revokedAt"
`;

class PostgresStore {
  constructor(pool) {
    this.pool = pool;
  }

  async query(q, p = []) {
    return this.pool.query(q, p);
  }

  async patientById(id) {
    return (
      await this.query(`SELECT ${PATIENT_COLUMNS} FROM patients WHERE id=$1`, [id])
    ).rows[0];
  }

  async patientByWallet(wallet) {
    return (
      await this.query(`SELECT ${PATIENT_COLUMNS} FROM patients WHERE lower(wallet)=lower($1)`, [wallet])
    ).rows[0];
  }

  async addPatient(x) {
    return (
      await this.query(
        `INSERT INTO patients(id,wallet,profile,critical,created_at)
         VALUES($1,$2,$3,$4,$5)
         RETURNING ${PATIENT_COLUMNS}`,
        [x.id, x.wallet, x.profile, x.critical, x.createdAt]
      )
    ).rows[0];
  }

  async recordsForPatient(id) {
    return (
      await this.query(
        `SELECT ${RECORD_COLUMNS} FROM records WHERE patient_id=$1 ORDER BY created_at DESC`,
        [id]
      )
    ).rows;
  }

  async recordById(patientId, recordId) {
    return (
      await this.query(
        `SELECT ${RECORD_COLUMNS} FROM records WHERE patient_id=$1 AND id=$2`,
        [patientId, recordId]
      )
    ).rows[0];
  }

  async addRecord(x) {
    return (
      await this.query(
        `INSERT INTO records(id,patient_id,record_type,doctor_id,ipfs_cid,encrypted_hash,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING ${RECORD_COLUMNS}`,
        [x.id, x.patientId, x.recordType, x.doctorId, x.ipfsCid, x.encryptedHash, x.createdAt]
      )
    ).rows[0];
  }

  async addAudit(x) {
    return (
      await this.query(
        `INSERT INTO audit_logs(id,patient_id,actor,action,record_id,provider_id,metadata,expires_at,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING ${AUDIT_COLUMNS}`,
        [
          x.id,
          x.patientId || null,
          x.actor,
          x.action,
          x.recordId || null,
          x.providerId || null,
          JSON.stringify(x.metadata || {}),
          x.expiresAt || null,
          x.timestamp,
        ]
      )
    ).rows[0];
  }

  async auditForPatient(id) {
    return (
      await this.query(
        `SELECT ${AUDIT_COLUMNS} FROM audit_logs WHERE patient_id=$1 ORDER BY created_at DESC`,
        [id]
      )
    ).rows;
  }

  async auditById(id) {
    return (
      await this.query(`SELECT ${AUDIT_COLUMNS} FROM audit_logs WHERE id=$1`, [id])
    ).rows[0];
  }

  async providerByWallet(wallet) {
    return (
      await this.query(`SELECT ${PROVIDER_COLUMNS} FROM providers WHERE lower(wallet)=lower($1)`, [wallet])
    ).rows[0];
  }

  async providers(status) {
    return (
      await this.query(
        status
          ? `SELECT ${PROVIDER_COLUMNS} FROM providers WHERE status=$1 ORDER BY created_at DESC`
          : `SELECT ${PROVIDER_COLUMNS} FROM providers ORDER BY created_at DESC`,
        status ? [status] : []
      )
    ).rows;
  }

  async addProvider(x) {
    return (
      await this.query(
        `INSERT INTO providers(id,wallet,name,license_number,specialty,status,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING ${PROVIDER_COLUMNS}`,
        [x.id, x.wallet, x.name, x.licenseNumber, x.specialty, x.status, x.createdAt]
      )
    ).rows[0];
  }

  async grantConsent(x) {
    const r = await this.query(
      `INSERT INTO patient_provider_consents(id,patient_id,provider_id,status,scope,granted_at)
       VALUES($1,$2,$3,'active',$4,$5)
       ON CONFLICT(patient_id,provider_id)
       DO UPDATE SET status='active',scope=excluded.scope,granted_at=excluded.granted_at,revoked_at=NULL
       RETURNING ${CONSENT_COLUMNS}`,
      [x.id, x.patientId, x.providerId, JSON.stringify(x.scope), x.grantedAt]
    );
    return r.rows[0];
  }

  async revokeConsent(patientId, providerId) {
    const r = await this.query(
      `UPDATE patient_provider_consents
       SET status='revoked',revoked_at=now()
       WHERE patient_id=$1 AND provider_id=$2 AND status='active'
       RETURNING ${CONSENT_COLUMNS}`,
      [patientId, providerId]
    );
    return r.rows[0];
  }

  async hasActiveConsent(patientId, providerId, scope) {
    const r = await this.query(
      `SELECT scope FROM patient_provider_consents
       WHERE patient_id=$1 AND provider_id=$2 AND status='active'`,
      [patientId, providerId]
    );
    return r.rows.some((row) => {
      const scopes = Array.isArray(row.scope) ? row.scope : [];
      return scopes.includes(scope);
    });
  }

  async consentsForPatient(id) {
    return (
      await this.query(
        `SELECT ${CONSENT_COLUMNS},
                p.wallet AS "providerWallet",
                p.name AS "providerName",
                p.specialty AS "providerSpecialty"
         FROM patient_provider_consents c
         JOIN providers p ON p.id=c.provider_id
         WHERE c.patient_id=$1
         ORDER BY c.granted_at DESC`,
        [id]
      )
    ).rows;
  }

  async updateProvider(wallet, patch) {
    const r = await this.query(
      `UPDATE providers
       SET status=$2,verified_by=$3,verified_at=$4,updated_at=now()
       WHERE lower(wallet)=lower($1)
       RETURNING ${PROVIDER_COLUMNS}`,
      [wallet, patch.status, patch.verifiedBy || null, patch.verifiedAt || null]
    );
    return r.rows[0];
  }
}

class JsonStore {
  constructor(file = process.env.DATA_FILE || path.join(process.cwd(), ".data", "goldenhour.json")) {
    this.file = file;
    this.state = { patients: [], records: [], audit: [], providers: [], consents: [] };
    if (fs.existsSync(file)) this.state = { ...this.state, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  }

  async patientById(id) { return this.state.patients.find((x) => x.id === id); }
  async patientByWallet(w) { return this.state.patients.find((x) => x.wallet.toLowerCase() === w.toLowerCase()); }
  async addPatient(x) { this.state.patients.push(x); return this.save(x); }
  async recordsForPatient(id) { return this.state.records.filter((x) => x.patientId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
  async recordById(patientId, recordId) { return this.state.records.find((x) => x.patientId === patientId && x.id === recordId); }
  async addRecord(x) { this.state.records.push(x); return this.save(x); }
  async addAudit(x) { this.state.audit.push(x); return this.save(x); }
  async auditForPatient(id) { return this.state.audit.filter((x) => x.patientId === id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); }
  async auditById(id) { return this.state.audit.find((x) => x.id === id); }
  async providerByWallet(w) { return this.state.providers.find((x) => x.wallet.toLowerCase() === w.toLowerCase()); }
  async providers(status) { return this.state.providers.filter((x) => !status || x.status === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
  async addProvider(x) { this.state.providers.push(x); return this.save(x); }
  async grantConsent(x) {
    this.state.consents = this.state.consents || [];
    const e = this.state.consents.find((v) => v.patientId === x.patientId && v.providerId === x.providerId);
    if (e) Object.assign(e, x, { status: "active", revokedAt: null });
    else this.state.consents.push({ ...x, status: "active" });
    return this.save(e || x);
  }
  async revokeConsent(patientId, providerId) {
    const x = (this.state.consents || []).find((v) => v.patientId === patientId && v.providerId === providerId && v.status === "active");
    if (!x) return null;
    x.status = "revoked";
    x.revokedAt = new Date().toISOString();
    return this.save(x);
  }
  async hasActiveConsent(patientId, providerId, scope) {
    const x = (this.state.consents || []).find((v) => v.patientId === patientId && v.providerId === providerId && v.status === "active");
    return !!x && (x.scope || []).includes(scope);
  }
  async consentsForPatient(id) {
    return (this.state.consents || []).filter((v) => v.patientId === id).map((v) => {
      const p = this.state.providers.find((x) => x.id === v.providerId);
      return { ...v, providerWallet: p?.wallet, providerName: p?.name, providerSpecialty: p?.specialty };
    });
  }
  async updateProvider(w, p) {
    const x = await this.providerByWallet(w);
    if (!x) return null;
    Object.assign(x, p);
    return this.save(x);
  }
  save(x) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const t = this.file + ".tmp";
    fs.writeFileSync(t, JSON.stringify(this.state));
    fs.renameSync(t, this.file);
    return x;
  }
}

async function createStore() {
  const pool = createPool();
  if (!pool) return new JsonStore();
  await pool.query("select 1");
  return new PostgresStore(pool);
}

module.exports = { createStore, PostgresStore, JsonStore };
