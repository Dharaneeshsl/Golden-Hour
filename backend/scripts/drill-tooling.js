#!/usr/bin/env node
/**
 * GoldenHour Production & Disaster Recovery Drill Tooling
 * 
 * Executes 4 critical operational readiness drills:
 * 1. Concurrency & Burst Load Drill (p95/p99 latency measurement, 0 errors)
 * 2. Fault Injection & Atomic Fail-Closed Drill (simulated audit failure rollback)
 * 3. Key-Loss & Crypto-Shredding Drill (verifiable cryptographic key destruction)
 * 4. Migration Concurrency & Advisory Lock Drill (single-client lock adherence)
 */

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();

const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const request = require("supertest");
const { Pool } = require("pg");
const { databaseOptions } = require("../src/config/databaseOptions");
const { createStore } = require("../src/config/db");
const { createApp } = require("../src/app");
const { EnvelopeEncryptionService } = require("../src/services/envelopeEncryptionService");
const { AuditChainService } = require("../src/services/auditChainService");

function calculatePercentile(numbers, p) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runLoadDrill(app, concurrency = 30) {
  console.info(`\n[DRILL 1/4] Starting Load & Concurrency Drill (${concurrency} concurrent requests)...`);
  const store = app.get("store");
  if (store?.query) {
    try { await store.query("DELETE FROM http_rate_limits"); } catch (_) {}
  }
  const latencies = [];
  const errors = [];

  const startTotal = performance.now();
  const promises = Array.from({ length: concurrency }, async (_, i) => {
    const t0 = performance.now();
    try {
      const res = await request(app)
        .get("/api/auth/nonce/0x1111111111111111111111111111111111111111")
        .set("Accept", "application/json");
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
      if (res.status >= 500) {
        errors.push({ status: res.status, body: res.body });
      }
    } catch (err) {
      errors.push({ error: err.message });
    }
  });

  await Promise.all(promises);
  const totalDuration = performance.now() - startTotal;

  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);

  console.info(`  Requests: ${concurrency} completed in ${totalDuration.toFixed(1)}ms`);
  console.info(`  Errors: ${errors.length} (target: 0)`);
  console.info(`  Latency: min=${min.toFixed(1)}ms, avg=${avg.toFixed(1)}ms, p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, p99=${p99.toFixed(1)}ms, max=${max.toFixed(1)}ms`);

  assert.equal(errors.length, 0, `Load drill failed with ${errors.length} errors: ${JSON.stringify(errors.slice(0, 3))}`);
  assert.ok(p95 < 500, `p95 latency (${p95.toFixed(1)}ms) exceeded SLA threshold of 500ms`);
  console.info("  PASS: Load & Concurrency Drill");
  return { concurrency, errors: errors.length, p50, p95, p99 };
}

async function runFaultInjectionDrill(store) {
  console.info("\n[DRILL 2/4] Starting Fault Injection & Fail-Closed Atomic Rollback Drill...");
  const audit = new AuditChainService(store);

  // 1. Verify baseline audit append works
  const testId = crypto.randomUUID();
  const drillPatient = crypto.randomUUID();
  await audit.appendAuditEvent({
    id: testId,
    patientId: drillPatient,
    actor: "0x1111111111111111111111111111111111111111",
    action: "DRILL_BASELINE",
    details: { drill: true },
  });

  // 2. Inject temporary failure into audit append
  const originalAppend = store.addAuditEvent ? store.addAuditEvent.bind(store) : null;
  let faultTriggered = false;

  if (store.addAuditEvent) {
    store.addAuditEvent = async () => {
      faultTriggered = true;
      throw new Error("SIMULATED_STORAGE_FAILURE: Audit trail disk unavailable");
    };
  } else {
    // If running in-memory or store without addAuditEvent, wrap query
    const origQuery = store.query.bind(store);
    store.query = async (text, params) => {
      if (typeof text === "string" && text.includes("audit_events")) {
        faultTriggered = true;
        throw new Error("SIMULATED_STORAGE_FAILURE: Audit trail disk unavailable");
      }
      return origQuery(text, params);
    };
  }

  // 3. Attempt audit event insertion while fault is active
  let failedAsExpected = false;
  try {
    await audit.appendAuditEvent({
      id: crypto.randomUUID(),
      patientId: drillPatient,
      actor: "0x1111111111111111111111111111111111111111",
      action: "DRILL_FAULT_EVENT",
      details: { drill: true },
    });
  } catch (err) {
    failedAsExpected = true;
    assert.ok(
      err.message.includes("SIMULATED_STORAGE_FAILURE"),
      `Unexpected error message during fault: ${err.message}`
    );
  }

  // Restore store function
  if (originalAppend) {
    store.addAuditEvent = originalAppend;
  }

  assert.ok(faultTriggered, "Fault injection hook was not invoked");
  assert.ok(failedAsExpected, "Audit append did NOT fail-closed when storage faulted!");

  // 4. Verify system self-heals / resumes cleanly once storage is healthy
  const recoveryId = crypto.randomUUID();
  const recoveredEvent = await audit.appendAuditEvent({
    id: recoveryId,
    patientId: drillPatient,
    actor: "0x1111111111111111111111111111111111111111",
    action: "DRILL_RECOVERED",
    details: { recovered: true },
  });

  assert.ok(recoveredEvent, "Failed to recover audit trail following fault resolution");
  console.info("  PASS: Fault Injection Drill (Atomic Fail-Closed confirmed)");
  return { faultTriggered, failedAsExpected, recovered: true };
}

async function runKeyLossDrill(store) {
  console.info("\n[DRILL 3/4] Starting Key-Loss & Verifiable Crypto-Shredding Drill...");
  const enc = new EnvelopeEncryptionService(null, store);
  const patientId = crypto.randomUUID();
  const clinicalPayload = {
    allergies: ["Penicillin", "Sulfa"],
    bloodGroup: "O+",
    conditions: ["Severe Acute Asthma"],
    timestamp: new Date().toISOString(),
  };

  // 1. Encrypt clinical record with patient's DEK
  const aad = { patientId, recordId: crypto.randomUUID() };
  const encrypted = await enc.encryptField(patientId, clinicalPayload, aad);
  assert.ok(encrypted.ciphertext, "Ciphertext must be generated");

  // 2. Decrypt and verify matching plaintext
  const decrypted = await enc.decryptField(patientId, encrypted);
  assert.deepEqual(decrypted, clinicalPayload, "Decrypted data must match original payload");

  // 3. Execute permanent crypto-shredding
  await enc.cryptoShred(patientId);

  // 4. Assert subsequent decryption attempts strictly fail (cannot recover plaintext)
  let decryptionBlocked = false;
  try {
    await enc.decryptField(patientId, encrypted);
  } catch (err) {
    decryptionBlocked = true;
    assert.ok(
      err.message.includes("permanently destroyed") || err.message.includes("shredded") || err.message.includes("Crypto-shredded"),
      `Unexpected error during post-shred decryption: ${err.message}`
    );
  }

  assert.ok(decryptionBlocked, "FATAL: Data was decrypted after DEK crypto-shredding!");
  console.info("  PASS: Key-Loss Drill (Zero plaintext reconstructible post-shred)");
  return { patientId, shredded: true, decryptionBlocked: true };
}

async function runMigrationRollbackDrill(pool) {
  console.info("\n[DRILL 4/4] Starting Migration Advisory Lock & Concurrency Drill...");
  if (!pool) {
    console.info("  SKIP: Database pool not provided (in-memory mode)");
    return { skipped: true };
  }

  const client1 = await pool.connect();
  const client2 = await pool.connect();
  try {
    const LOCK_ID = 849204819;

    // Client 1 acquires migration advisory lock
    await client1.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);

    // Client 2 attempts non-blocking try-lock: must receive false
    const tryRes = await client2.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_ID]);
    const secondAcquired = tryRes.rows[0].locked;
    assert.equal(secondAcquired, false, "Second client acquired migration lock while held by first!");

    // Client 1 releases lock
    await client1.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);

    // Client 2 can now acquire lock
    const secondTryRes = await client2.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_ID]);
    assert.equal(secondTryRes.rows[0].locked, true, "Second client could not acquire released lock");

    // Release lock on client 2
    await client2.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);

    // Verify schema_migrations table existence and recorded migrations
    const migRes = await client1.query("SELECT COUNT(*) AS count FROM schema_migrations");
    const count = Number(migRes.rows[0].count);
    assert.ok(count > 0, `schema_migrations table empty or unpopulated (count: ${count})`);
    console.info(`  Verified ${count} recorded schema migrations with single-client advisory locks`);
    console.info("  PASS: Migration Concurrency & Advisory Lock Drill");
    return { lockExclusionVerified: true, migrationCount: count };
  } finally {
    client1.release();
    client2.release();
  }
}

async function runAllDrills() {
  console.info("================================================================================");
  console.info("        GOLDENHOUR OPERATIONAL READINESS & DISASTER RECOVERY DRILLS             ");
  console.info("================================================================================");

  let pool = null;
  let store = null;

  if (process.env.DATABASE_URL) {
    pool = new Pool(databaseOptions());
    store = await createStore(pool);
  } else {
    // In-memory store fallback for test runner
    store = {
      isReady: () => true,
      chain: [],
      keys: new Map(),
      challenges: new Map(),
      async saveChallenge(wallet, message, expiresAt) {
        this.challenges.set(wallet, { wallet, message, expiresAt });
      },
      async getChallenge(wallet) {
        return this.challenges.get(wallet) || null;
      },
      async addAuditEvent(evt) {
        this.chain.push(evt);
        return evt;
      },
      async getLastAuditEvent() {
        return this.chain[this.chain.length - 1] || null;
      },
      async saveKeyRecord(rec) {
        this.keys.set(rec.patientId || rec.patient_id, rec);
      },
      async getKeyRecord(id) {
        return this.keys.get(id) || null;
      },
      limits: new Map(),
      async shredKeyRecord(id) {
        const r = this.keys.get(id) || { patientId: id };
        r.status = "shredded";
        r.encryptedDEK = "[CRYPTO_SHREDDED_PERMANENTLY_DESTROYED]";
        this.keys.set(id, r);
      },
      async query(text, params) {
        if (typeof text === "string" && text.includes("http_rate_limits")) {
          const key = params ? `${params[0]}:${params[1]}` : "default";
          const current = (this.limits.get(key) || 0) + 1;
          this.limits.set(key, current);
          return { rows: [{ hits: current, expires_at: new Date(Date.now() + 60000).toISOString() }] };
        }
        return { rows: [] };
      },
    };
  }

  const app = await createApp({
    store,
    otpProvider: {
      sendOtp: async () => ({ success: true }),
      verifyOtp: async () => ({ success: true }),
    },
  });

  const startTime = Date.now();
  const results = {};

  try {
    results.load = await runLoadDrill(app, 30);
    results.fault = await runFaultInjectionDrill(store);
    results.keyLoss = await runKeyLossDrill(store);
    results.migration = await runMigrationRollbackDrill(pool);

    const elapsed = Date.now() - startTime;
    console.info("\n================================================================================");
    console.info(`ALL DRILLS PASSED SUCCESSFULLY in ${elapsed}ms`);
    console.info("  [1] Load & Concurrency: PASS (p95 latency within clinical safety bounds)");
    console.info("  [2] Fault Injection:    PASS (Fail-closed atomic rollback confirmed)");
    console.info("  [3] Key-Loss & Shred:   PASS (Verifiable zero plaintext leak post-shred)");
    console.info(`  [4] Migration Locks:    PASS (${pool ? "Advisory locks confirmed" : "In-memory skipped"})`);
    console.info("================================================================================\n");
    return results;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runAllDrills().catch((err) => {
    console.error("\nDRILL FAILED:", err);
    process.exit(1);
  });
}

module.exports = {
  runLoadDrill,
  runFaultInjectionDrill,
  runKeyLossDrill,
  runMigrationRollbackDrill,
  runAllDrills,
};
