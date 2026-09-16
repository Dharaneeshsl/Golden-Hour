const test = require("node:test");
const assert = require("node:assert/strict");
const { PostgresStore } = require("../src/config/db");

function fakePool(rows) {
  const queries = [];
  return {
    queries,
    async query(text, params) {
      queries.push({ text, params });
      return { rows: typeof rows === "function" ? rows(text, params) : rows };
    },
  };
}

test("PostgresStore exposes camelCase record fields", async () => {
  const pool = fakePool([
    {
      id: "record-1",
      patientId: "patient-1",
      recordType: "lab",
      doctorId: "0xdoctor",
      ipfsCid: "cid-1",
      encryptedHash: "hash-1",
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  ]);
  const store = new PostgresStore(pool);
  const record = await store.recordsForPatient("patient-1");
  assert.equal(record[0].recordType, "lab");
  assert.equal(record[0].ipfsCid, "cid-1");
  assert.match(pool.queries[0].text, /record_type AS "recordType"/);
  assert.match(pool.queries[0].text, /created_at AS "createdAt"/);
});

test("PostgresStore exposes emergency audit expiry as expiresAt", async () => {
  const pool = fakePool([
    {
      id: "audit-1",
      patientId: "patient-1",
      actor: "0xdoctor",
      action: "EMERGENCY_BREAK_GLASS",
      providerId: "provider-1",
      metadata: {},
      expiresAt: "2026-09-16T00:15:00.000Z",
      timestamp: "2026-09-16T00:00:00.000Z",
    },
  ]);
  const store = new PostgresStore(pool);
  const event = await store.auditById("audit-1");
  assert.equal(event.expiresAt, "2026-09-16T00:15:00.000Z");
  assert.match(pool.queries[0].text, /expires_at AS "expiresAt"/);
});

test("PostgresStore exposes enriched consent provider fields in camelCase", async () => {
  const pool = fakePool([
    {
      id: "consent-1",
      patientId: "patient-1",
      providerId: "provider-1",
      status: "active",
      scope: ["records"],
      grantedAt: "2026-09-16T00:00:00.000Z",
      revokedAt: null,
      providerWallet: "0xdoctor",
      providerName: "Dr Test",
      providerSpecialty: "Emergency",
    },
  ]);
  const store = new PostgresStore(pool);
  const consent = await store.consentsForPatient("patient-1");
  assert.equal(consent[0].providerWallet, "0xdoctor");
  assert.equal(consent[0].providerName, "Dr Test");
  assert.equal(consent[0].providerSpecialty, "Emergency");
  assert.match(pool.queries[0].text, /provider_wallet AS "providerWallet"/);
});
