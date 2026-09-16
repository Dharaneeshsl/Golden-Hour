const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePatient,
  normalizeProvider,
  normalizeRecord,
  normalizeAudit,
  normalizeConsent,
} = require("../src/config/db");

test("PostgresStore normalizes raw PostgreSQL snake_case rows into camelCase objects", () => {
  const patientRow = {
    id: "p1",
    wallet: "0x1234567890123456789012345678901234567890",
    profile: '{"fullName":"John Doe"}',
    critical: '{"bloodGroup":"O+"}',
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const patient = normalizePatient(patientRow);
  assert.equal(patient.id, "p1");
  assert.equal(patient.profile.fullName, "John Doe");
  assert.equal(patient.critical.bloodGroup, "O+");
  assert.equal(patient.createdAt, "2026-01-01T00:00:00.000Z");

  const providerRow = {
    id: "doc1",
    wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    name: "Dr. Smith",
    license_number: "MD-99",
    specialty: "Emergency",
    status: "verified",
    verified_by: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    verified_at: "2026-01-02T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const provider = normalizeProvider(providerRow);
  assert.equal(provider.licenseNumber, "MD-99");
  assert.equal(provider.verifiedBy, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  assert.equal(provider.verifiedAt, "2026-01-02T00:00:00.000Z");

  const recordRow = {
    id: "r1",
    patient_id: "p1",
    record_type: "Bloodwork",
    doctor_id: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    ipfs_cid: "QmTest123",
    encrypted_hash: "abcd",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const record = normalizeRecord(recordRow);
  assert.equal(record.patientId, "p1");
  assert.equal(record.recordType, "Bloodwork");
  assert.equal(record.ipfsCid, "QmTest123");
  assert.equal(record.encryptedHash, "abcd");

  const auditRow = {
    id: "a1",
    patient_id: "p1",
    actor: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    action: "EMERGENCY_BREAK_GLASS",
    expires_at: "2026-01-01T00:15:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const audit = normalizeAudit(auditRow);
  assert.equal(audit.patientId, "p1");
  assert.equal(audit.expiresAt, "2026-01-01T00:15:00.000Z");

  const consentRow = {
    id: "c1",
    patient_id: "p1",
    provider_id: "doc1",
    status: "active",
    scope: '["records"]',
    granted_at: "2026-01-01T00:00:00.000Z",
    provider_wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    provider_name: "Dr. Smith",
    provider_specialty: "Emergency",
  };
  const consent = normalizeConsent(consentRow);
  assert.equal(consent.patientId, "p1");
  assert.equal(consent.providerWallet, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  assert.equal(consent.providerName, "Dr. Smith");
});
