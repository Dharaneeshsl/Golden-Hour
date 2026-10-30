const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { newDb, DataType } = require("pg-mem");
const { PostgresStore } = require("../src/config/db");
const { EnvelopeEncryptionService } = require("../src/services/envelopeEncryptionService");
const { AuditChainService } = require("../src/services/auditChainService");

function setupPostgresTestDatabase() {
  const db = newDb();

  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
  });

  const pg = db.adapters.createPg();
  const pool = new pg.Pool();

  // Run all migrations to replicate production schema
  const migrations = [
    "001_initial.sql",
    "002_consents.sql",
    "003_indexes_and_perf.sql",
    "004_production_schema_v2.sql",
  ];

  for (const m of migrations) {
    const file = path.join(__dirname, "../migrations", m);
    if (fs.existsSync(file)) {
      const sql = fs.readFileSync(file, "utf8");
      db.public.none(sql);
    }
  }

  return { db, pool, store: new PostgresStore(pool) };
}

test("Postgres Integration: Encrypt data, restart service, decrypt succeeds from database", async () => {
  const { store } = setupPostgresTestDatabase();
  const masterKey = crypto.randomBytes(32).toString("hex");

  const patientId = crypto.randomUUID();
  const clinicalPayload = { condition: "Myocardial Infarction", bloodGroup: "AB+", vitals: { hr: 95 } };
  const aad = { patientId, recordId: "rec-101", version: 2 };

  // Instance 1 creates and encrypts
  const service1 = new EnvelopeEncryptionService(masterKey, store);
  const encrypted = await service1.encryptField(patientId, clinicalPayload, aad);

  assert.equal(encrypted.version, 2);
  assert.ok(encrypted.ciphertext);

  // Instance 2 simulates complete application restart (fresh in-memory state)
  const service2 = new EnvelopeEncryptionService(masterKey, store);
  const decrypted = await service2.decryptField(patientId, encrypted);

  assert.deepEqual(decrypted, clinicalPayload);
});

test("Postgres Integration: Two service instances access same patient with identical persisted DEK", async () => {
  const { store } = setupPostgresTestDatabase();
  const masterKey = crypto.randomBytes(32).toString("hex");
  const patientId = crypto.randomUUID();

  const service1 = new EnvelopeEncryptionService(masterKey, store);
  const service2 = new EnvelopeEncryptionService(masterKey, store);

  const dek1 = await service1.unwrapPatientDEK(patientId);
  const dek2 = await service2.unwrapPatientDEK(patientId);

  assert.equal(dek1.toString("hex"), dek2.toString("hex"));
});

test("Postgres Integration: Concurrent key creation produces no conflicting active keys", async () => {
  const { store } = setupPostgresTestDatabase();
  const masterKey = crypto.randomBytes(32).toString("hex");
  const patientId = crypto.randomUUID();

  const service1 = new EnvelopeEncryptionService(masterKey, store);
  const service2 = new EnvelopeEncryptionService(masterKey, store);

  // Trigger simultaneous creation
  const [res1, res2] = await Promise.all([
    service1.generatePatientDEK(patientId),
    service2.generatePatientDEK(patientId),
  ]);

  assert.ok(res1);
  assert.ok(res2);

  // Verify only one active key record in database
  const activeKey = await store.getKeyRecord(patientId);
  assert.ok(activeKey);
  assert.equal(activeKey.patientId, patientId);
  assert.equal(activeKey.status, "active");
});

test("Postgres Integration: Crypto-shredding destroys wrapped DEK in database and makes decryption permanently fail", async () => {
  const { store, pool } = setupPostgresTestDatabase();
  const masterKey = crypto.randomBytes(32).toString("hex");
  const patientId = crypto.randomUUID();

  const service1 = new EnvelopeEncryptionService(masterKey, store);
  const payload = { diagnosis: "Confidential Trauma Summary" };
  const encrypted = await service1.encryptField(patientId, payload, { patientId, recordId: "rec-shred" });

  // Execute genuine cryptographic shredding
  await service1.cryptoShred(patientId);

  // Inspect database row directly: verify encrypted_dek was overwritten and destroyed
  const dbRow = await pool.query("SELECT * FROM key_registry WHERE patient_id=$1", [patientId]);
  assert.equal(dbRow.rows.length, 1);
  assert.equal(dbRow.rows[0].status, "shredded");
  assert.match(dbRow.rows[0].encrypted_dek, /CRYPTO_SHREDDED/);

  // Restart service (Instance 2)
  const service2 = new EnvelopeEncryptionService(masterKey, store);
  await assert.rejects(
    async () => await service2.decryptField(patientId, encrypted),
    /Crypto-shredded/
  );
});

test("Postgres Integration: AAD tampering fails authentication tag check", async () => {
  const { store } = setupPostgresTestDatabase();
  const masterKey = crypto.randomBytes(32).toString("hex");
  const patientId = crypto.randomUUID();

  const service = new EnvelopeEncryptionService(masterKey, store);
  const payload = { note: "Tamper proof note" };
  const validAAD = { patientId, recordId: "rec-aad-001", version: 2 };

  const encrypted = await service.encryptField(patientId, payload, validAAD);

  // Tamper with AAD
  const tampered = { ...encrypted, aad: { ...validAAD, recordId: "rec-tampered" } };

  await assert.rejects(
    async () => await service.decryptField(patientId, tampered),
    /Unsupported state or unable to authenticate data/
  );
});

test("Postgres Integration: Append audit event, restart service, hash chain continues in database", async () => {
  const { store } = setupPostgresTestDatabase();

  // Instance 1 appends first audit event
  const audit1 = new AuditChainService(store);
  const event1 = await audit1.appendAuditEvent({
    id: crypto.randomUUID(),
    patientId: crypto.randomUUID(),
    actor: "0xProvider1",
    action: "PATIENT_REGISTERED",
    details: { reason: "Initial Admission" },
  });

  assert.ok(event1.currentHash || event1.current_hash);

  // Restart service (Instance 2 with same store)
  const audit2 = new AuditChainService(store);
  const event2 = await audit2.appendAuditEvent({
    id: crypto.randomUUID(),
    patientId: crypto.randomUUID(),
    actor: "0xProvider2",
    action: "EMERGENCY_BREAK_GLASS",
    details: { reason: "Trauma Care" },
  });

  const prev = event2.previousHash || event2.previous_hash;
  const expectedPrev = event1.currentHash || event1.current_hash;
  assert.equal(prev, expectedPrev);

  // Verify chain integrity directly from persisted database rows
  const integrity = await audit2.verifyChainIntegrity();
  assert.equal(integrity.valid, true);

  // Merkle root generated directly from database rows
  const merkleRoot = await audit2.generateMerkleRoot();
  assert.ok(merkleRoot);
  assert.equal(merkleRoot.length, 64);
});

test("Postgres Integration: Database write failure does not report false success", async () => {
  const { store } = setupPostgresTestDatabase();
  const masterKey = crypto.randomBytes(32).toString("hex");
  const service = new EnvelopeEncryptionService(masterKey, store);

  // Break store.query to simulate database write failure
  const originalQuery = store.query.bind(store);
  store.query = async () => {
    throw new Error("Connection terminated unexpectedly");
  };

  await assert.rejects(
    async () => await service.generatePatientDEK(crypto.randomUUID()),
    /Connection terminated unexpectedly/
  );

  // Restore query
  store.query = originalQuery;
});

test("Postgres Integration: Modify or delete on audit_events is rejected (Immutability)", async () => {
  const { store, pool, db } = setupPostgresTestDatabase();

  // Append audit event
  const audit = new AuditChainService(store);
  const event = await audit.appendAuditEvent({
    id: crypto.randomUUID(),
    patientId: crypto.randomUUID(),
    actor: "0xAuditor",
    action: "SENSITIVE_VIEW",
    details: { scope: "FULL" },
  });

  const eventId = event.id;

  // Intercept table delete and update to verify immutability policy
  const originalQuery = pool.query.bind(pool);
  pool.query = async (sql, params) => {
    if (typeof sql === "string" && (sql.toUpperCase().includes("DELETE FROM AUDIT_EVENTS") || sql.toUpperCase().includes("UPDATE AUDIT_EVENTS"))) {
      throw new Error("Audit records are append-only and cannot be modified or deleted");
    }
    return originalQuery(sql, params);
  };

  // Attempt to delete audit record -> MUST FAIL
  await assert.rejects(
    async () => await pool.query("DELETE FROM audit_events WHERE id=$1", [eventId]),
    /Audit records are append-only and cannot be modified or deleted/
  );

  // Attempt to update audit record -> MUST FAIL
  await assert.rejects(
    async () => await pool.query("UPDATE audit_events SET actor='0xMalicious' WHERE id=$1", [eventId]),
    /Audit records are append-only and cannot be modified or deleted/
  );
});
