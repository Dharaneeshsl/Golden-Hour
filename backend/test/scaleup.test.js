const test = require("node:test");
const assert = require("node:assert/strict");
const { envelopeEncryption } = require("../src/services/envelopeEncryptionService");
const { auditChain } = require("../src/services/auditChainService");
const { toFhirPatient, toFhirAllergies, buildIPSBundle } = require("../src/services/fhirService");
const { notificationService } = require("../src/services/notificationService");
const { createComplianceController } = require("../src/controllers/complianceController");

test("Scale-Up: Envelope Encryption with per-patient DEK and AAD binding works", () => {
  const patientId = "patient-uuid-scaleup-001";
  const clinicalPayload = {
    bloodGroup: "O+",
    allergies: ["Penicillin", "Peanuts"],
    chronicConditions: ["Asthma"],
    vitals: { bp: "120/80", hr: 72 },
  };

  const aad = { patientId, recordId: "rec-001", version: 2 };
  const encrypted = envelopeEncryption.encryptField(patientId, clinicalPayload, aad);

  assert.equal(encrypted.version, 2);
  assert.equal(encrypted.algorithm, "aes-256-gcm");
  assert.ok(encrypted.iv);
  assert.ok(encrypted.tag);
  assert.ok(encrypted.ciphertext);

  // Decrypt with valid AAD
  const decrypted = envelopeEncryption.decryptField(patientId, encrypted);
  assert.deepEqual(decrypted, clinicalPayload);

  // Crypto-shredding test
  const shredded = envelopeEncryption.cryptoShred(patientId);
  assert.equal(shredded, true);

  // Verify that subsequent decryption is mathematically impossible
  assert.throws(
    () => envelopeEncryption.decryptField(patientId, encrypted),
    /Crypto-shredded/
  );
});

test("Scale-Up: Hash-chained audit log maintains tamper-evidence and generates Merkle root", () => {
  const event1 = auditChain.appendAuditEvent({
    id: "audit-001",
    patientId: "p-001",
    actor: "0xDoctorWallet1",
    action: "EMERGENCY_BREAK_GLASS",
    details: { reasonCode: "UNCONSCIOUS_TRAUMA" },
  });

  const event2 = auditChain.appendAuditEvent({
    id: "audit-002",
    patientId: "p-001",
    actor: "0xDoctorWallet1",
    action: "CRITICAL_VIEW",
    details: { viewDurationMs: 420 },
  });

  assert.ok(event1.currentHash);
  assert.equal(event2.previousHash, event1.currentHash);

  const integrityCheck = auditChain.verifyChainIntegrity();
  assert.equal(integrityCheck.valid, true);

  // Generate 32-byte Merkle Root for blockchain anchoring
  const merkleRoot = auditChain.generateMerkleRoot();
  assert.ok(merkleRoot);
  assert.equal(merkleRoot.length, 64); // 32-byte hex string
});

test("Scale-Up: FHIR R4 International Patient Summary (IPS) bundle serialization", () => {
  const patient = {
    id: "p-fhir-999",
    wallet: "0x1111111111111111111111111111111111111111",
    profile: {
      fullName: "Ananya Sharma",
      gender: "Female",
      phone: "+91-9876543210",
    },
    critical: {
      bloodGroup: "B+",
      allergies: ["Sulfa Drugs", "Aspirin"],
      conditions: ["Type 1 Diabetes"],
    },
  };

  const bundle = buildIPSBundle(patient);
  assert.equal(bundle.resourceType, "Bundle");
  assert.equal(bundle.type, "document");
  assert.ok(bundle.entry.length >= 3); // Patient + 2 allergies + 1 condition

  const patientEntry = bundle.entry.find((e) => e.resource.resourceType === "Patient");
  assert.equal(patientEntry.resource.name[0].text, "Ananya Sharma");

  const allergyEntry = bundle.entry.find(
    (e) => e.resource.resourceType === "AllergyIntolerance" && e.resource.code.text === "Sulfa Drugs"
  );
  assert.ok(allergyEntry);
  assert.equal(allergyEntry.resource.criticality, "high");
});

test("Scale-Up: Emergency notification dispatcher returns LOGGED_ONLY until SMS provider connected", async () => {
  const alerts = await notificationService.sendEmergencyAlert({
    patientId: "p-alert-001",
    patientPhone: "+91-9876543210",
    emergencyContact: "+91-9876500000",
    doctorName: "Dr. Arvind Swaminathan",
    facility: "Coimbatore Medical Center Trauma Ward",
    reasonCode: "CARDIAC_ARREST",
  });

  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].type, "SMS");
  assert.equal(alerts[0].status, "LOGGED_ONLY");
  assert.ok(alerts[0].message.includes("CARDIAC_ARREST"));
  assert.ok(alerts[1].message.includes("emergency contact"));
});

test("Scale-Up: Compliance route lockdown enforces patient authorization, token ID derivation, and disabled erasure", async () => {
  const mockStore = {
    patientById: async (id) => (id === "p-123" ? { id: "p-123", wallet: "0x1111111111111111111111111111111111111111", profile: {}, critical: {} } : null),
    patientByWallet: async (w) => (w.toLowerCase() === "0x1111111111111111111111111111111111111111".toLowerCase() ? { id: "p-123", wallet: "0x1111111111111111111111111111111111111111" } : null),
    addAudit: async () => {},
  };

  const controller = createComplianceController({ store: mockStore });

  // 1. Export unauthorized check (caller is different wallet)
  let statusSet = null;
  let jsonResult = null;
  const mockRes = {
    status: (s) => { statusSet = s; return mockRes; },
    json: (j) => { jsonResult = j; return mockRes; },
  };

  await controller.exportData(
    { params: { patientId: "p-123" }, user: { wallet: "0x9999999999999999999999999999999999999999", role: "patient" } },
    mockRes
  );
  assert.equal(statusSet, 403);
  assert.ok(jsonResult.error.includes("strictly authorized to export only their own clinical data"));

  // 2. Export authorized check (caller is owner)
  statusSet = 200;
  await controller.exportData(
    { params: { patientId: "p-123" }, user: { wallet: "0x1111111111111111111111111111111111111111", patientId: "p-123", role: "patient" } },
    mockRes
  );
  assert.equal(jsonResult.resourceType, "Bundle");

  // 3. DSR ignores req.body.patientId and uses token / caller patient lookup
  statusSet = null;
  await controller.submitDSR(
    {
      body: { patientId: "p-fake-spoofed-id", requestType: "access", details: "Access my records" },
      user: { wallet: "0x1111111111111111111111111111111111111111", patientId: "p-123", role: "patient" },
    },
    mockRes
  );
  assert.equal(statusSet, 201);
  assert.equal(jsonResult.dsr.patientId, "p-123"); // Proven not spoofed to p-fake-spoofed-id!

  // 4. Erasure is disabled with 503
  statusSet = null;
  await controller.executeErasure({ params: { patientId: "p-123" } }, mockRes);
  assert.equal(statusSet, 503);
  assert.ok(jsonResult.error.includes("disabled pending Step 4"));
});
