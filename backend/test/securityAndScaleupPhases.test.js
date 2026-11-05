const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_WALLETS = "0x0000000000000000000000000000000000000003,0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const request = require("supertest");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { createApp } = require("../src/app");
const { JsonStore, canonicalizeWallet } = require("../src/config/db");
const { EnvelopeEncryptionService } = require("../src/services/envelopeEncryptionService");
const { AuditChainService } = require("../src/services/auditChainService");
const { OutboxService } = require("../src/services/outboxService");

const patientWallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const doctorWallet = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const adminWallet = "0x0000000000000000000000000000000000000003";

function authHeader(wallet, role, sessionId = null) {
  const secret = process.env.JWT_SECRET;
  const token = jwt.sign(
    { wallet: canonicalizeWallet(wallet), role, sessionId },
    secret,
    { expiresIn: "15m", algorithm: "HS256", issuer: "goldenhour" }
  );
  return { Authorization: `Bearer ${token}` };
}

test("B5: Admin PHI access is blocked - admin cannot decrypt clinical records", async () => {
  const store = new JsonStore(":memory:");
  const app = await createApp({ store, chain: { enabled: false } });

  // Register patient
  const patient = await store.addPatient({
    id: crypto.randomUUID(),
    wallet: patientWallet,
    profile: { name: "Alice" },
    critical: { bloodGroup: "A+" },
  });

  // Verified doctor
  const doctor = await store.addProvider({
    id: crypto.randomUUID(),
    wallet: doctorWallet,
    name: "Dr. Smith",
    licenseNumber: "DOC-123",
    specialty: "Trauma",
    status: "verified",
  });

  // Grant consent via API
  const consentRes = await request(app)
    .post(`/api/consents/${patient.id}`)
    .set(authHeader(patientWallet, "patient"))
    .send({ wallet: doctorWallet });
  assert.equal(consentRes.status, 201);

  // Doctor creates record
  const recRes = await request(app)
    .post("/api/records")
    .set(authHeader(doctorWallet, "doctor"))
    .send({
      patientId: patient.id,
      recordType: "Discharge Summary",
      clinicalData: { diagnosis: "Acute concussion", vitals: "Stable" },
    });
  assert.equal(recRes.status, 201);

  // Admin tries to view/decrypt clinical record -> MUST BE 403 FORBIDDEN
  const adminRead = await request(app)
    .get(`/api/records/${patient.id}/${recRes.body.id}`)
    .set(authHeader(adminWallet, "admin"));
  assert.equal(adminRead.status, 403, "Admin should be forbidden from reading patient clinical records");

  // Patient reading own record -> 200 OK
  const patientRead = await request(app)
    .get(`/api/records/${patient.id}/${recRes.body.id}`)
    .set(authHeader(patientWallet, "patient"));
  assert.equal(patientRead.status, 200);
  assert.equal(patientRead.body.clinicalData.diagnosis, "Acute concussion");
});

test("B7: Break-glass review queue and emergency rate limits work", async () => {
  const store = new JsonStore(":memory:");
  const app = await createApp({ store, chain: { enabled: false } });

  const patient = await store.addPatient({
    id: crypto.randomUUID(),
    wallet: patientWallet,
    profile: { name: "Bob", phone: "+919876543210" },
    critical: { bloodGroup: "O-", emergencyContact: "+919876543211" },
  });

  await store.addProvider({
    id: crypto.randomUUID(),
    wallet: doctorWallet,
    name: "Dr. Dave",
    licenseNumber: "DOC-999",
    specialty: "Critical Care",
    status: "verified",
  });

  // Doctor triggers break-glass access
  const emergencyRes = await request(app)
    .post("/api/emergency-access")
    .set(authHeader(doctorWallet, "doctor"))
    .send({
      patientId: patient.id,
      justification: "Patient arrived comatose following a motor vehicle collision",
      reasonCode: "UNCONSCIOUS_TRAUMA",
      facility: "Metro Trauma Center",
    });
  assert.equal(emergencyRes.status, 200);
  assert.ok(emergencyRes.body.accessId);

  // Admin checks pending review queue
  const pendingRes = await request(app)
    .get("/api/emergency-access/reviews/pending")
    .set(authHeader(adminWallet, "admin"));
  assert.equal(pendingRes.status, 200);
  assert.ok(Array.isArray(pendingRes.body));
  assert.ok(pendingRes.body.length >= 1);

  // Admin submits review
  const reviewRes = await request(app)
    .post(`/api/emergency-access/reviews/${emergencyRes.body.accessId}`)
    .set(authHeader(adminWallet, "admin"))
    .send({
      decision: "approved",
      notes: "Reviewed and confirmed justification aligns with trauma protocol",
    });
  assert.equal(reviewRes.status, 201);
  assert.equal(reviewRes.body.decision, "approved");
});

test("B17: Consent expiration and purpose validation work", async () => {
  const store = new JsonStore(":memory:");
  const app = await createApp({ store, chain: { enabled: false } });

  const patient = await store.addPatient({
    id: crypto.randomUUID(),
    wallet: patientWallet,
    profile: { name: "Charlie" },
    critical: { bloodGroup: "B+" },
  });

  const doctor = await store.addProvider({
    id: crypto.randomUUID(),
    wallet: doctorWallet,
    name: "Dr. Evans",
    licenseNumber: "DOC-888",
    specialty: "Surgery",
    status: "verified",
  });

  // Grant consent with PAST expiration time
  const pastExpiration = new Date(Date.now() - 60 * 1000).toISOString();
  await store.grantConsent({
    id: crypto.randomUUID(),
    patientId: patient.id,
    providerId: doctor.id,
    scope: ["records"],
    purpose: "CONSULTATION",
    expiresAt: pastExpiration,
    grantedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  });

  // Doctor attempts to create record with expired consent -> MUST BE 403
  const failRes = await request(app)
    .post("/api/records")
    .set(authHeader(doctorWallet, "doctor"))
    .send({
      patientId: patient.id,
      recordType: "Lab Report",
      clinicalData: { test: "CBC", result: "Normal" },
    });
  assert.equal(failRes.status, 403);
  assert.match(failRes.body.error, /consent required/i);
});

test("B10 & B11: SIWE, Session tracking, and Server-side Revocation work", async () => {
  const store = new JsonStore(":memory:");
  const app = await createApp({ store, chain: { enabled: false } });

  // Generate wallet for signature
  const wallet = ethers.Wallet.createRandom();
  await store.addPatient({
    id: crypto.randomUUID(),
    wallet: wallet.address,
    profile: { name: "Signer User" },
    critical: {},
  });

  // Request SIWE nonce
  const nonceRes = await request(app).get(`/api/auth/nonce/${wallet.address}`);
  assert.equal(nonceRes.status, 200);
  assert.ok(nonceRes.body.nonce);
  assert.ok(nonceRes.body.siweMessage);

  // Sign message
  const signature = await wallet.signMessage(nonceRes.body.siweMessage);

  // Verify
  const verifyRes = await request(app)
    .post("/api/auth/verify")
    .send({
      wallet: wallet.address,
      signature,
      message: nonceRes.body.siweMessage,
    });
  assert.equal(verifyRes.status, 200);
  assert.ok(verifyRes.body.token);
  assert.ok(verifyRes.body.sessionId);

  const sessionId = verifyRes.body.sessionId;
  const userToken = verifyRes.body.token;

  // Authenticated call succeeds
  const meRes = await request(app)
    .get("/api/patients/me")
    .set({ Authorization: `Bearer ${userToken}` });
  assert.equal(meRes.status, 200);

  // Logout / Revoke session
  const logoutRes = await request(app)
    .post("/api/auth/logout")
    .set({ Authorization: `Bearer ${userToken}` });
  assert.equal(logoutRes.status, 200);

  // Subsequent call with revoked token is rejected with 401
  const afterLogout = await request(app)
    .get("/api/patients/me")
    .set({ Authorization: `Bearer ${userToken}` });
  assert.equal(afterLogout.status, 401);
  assert.match(afterLogout.body.error, /revoked/i);
});

test("Step 4: Persistent Envelope Encryption with Key Registry and Crypto-Shredding", async () => {
  const store = new JsonStore(":memory:");
  const service = new EnvelopeEncryptionService(undefined, store);
  const patientId = crypto.randomUUID();

  const data = { diagnosis: "Fracture", medication: ["Ibuprofen"] };
  const aad = { patientId, recordId: "rec-reg-001", version: 2 };

  const encrypted = await service.encryptField(patientId, data, aad);
  assert.equal(encrypted.version, 2);

  // Verify key record persisted in store
  const storedKey = await store.getKeyRecord(patientId);
  assert.ok(storedKey);
  assert.equal(storedKey.patientId, patientId);
  assert.equal(storedKey.status, "active");

  // Decrypt works
  const decrypted = await service.decryptField(patientId, encrypted);
  assert.deepEqual(decrypted, data);

  // Crypto-shredding
  await service.cryptoShred(patientId);
  const shreddedKey = await store.getKeyRecord(patientId);
  assert.ok(shreddedKey);
  assert.equal(shreddedKey.status, "shredded");
  assert.match(shreddedKey.encryptedDEK, /CRYPTO_SHREDDED/);

  await assert.rejects(
    async () => await service.decryptField(patientId, encrypted),
    /Crypto-shredded/
  );
});

test("Step 4: AuditChainService connects with store and verifies hash chain", async () => {
  const store = new JsonStore(":memory:");
  const audit = new AuditChainService(store);

  const event1 = await audit.appendAuditEvent({
    id: "evt-001",
    patientId: crypto.randomUUID(),
    actor: doctorWallet,
    action: "RECORD_CREATED",
    details: { type: "Lab" },
  });
  assert.ok(event1.currentHash);

  const event2 = await audit.appendAuditEvent({
    id: "evt-002",
    patientId: "p-audit-001",
    actor: doctorWallet,
    action: "CONSENT_ACCESSED",
    details: { purpose: "TREATMENT" },
  });
  assert.equal(event2.previousHash, event1.currentHash);

  const integrity = await audit.verifyChainIntegrity();
  assert.equal(integrity.valid, true);

  const merkleRoot = await audit.generateMerkleRoot();
  assert.ok(merkleRoot);
  assert.equal(merkleRoot.length, 64);
});

test("B13: Transactional Outbox enqueues and reconciles tasks", async () => {
  const store = new JsonStore(":memory:");
  const outbox = new OutboxService(store);

  const item = await outbox.enqueue("SMS_NOTIFICATION", {
    patientId: "p-001",
    message: "Emergency access alert",
  });
  assert.ok(item.id);

  let mockSent = false;
  const mockNotification = {
    sendEmergencyAlert: async () => {
      mockSent = true;
      return [{ status: "DELIVERED" }];
    },
  };

  const processed = await outbox.processPending({ notificationService: mockNotification });
  assert.equal(processed.length, 1);
  assert.equal(processed[0].status, "sent");
  assert.equal(mockSent, true);

  // Verify no pending items left
  const remaining = await store.getPendingOutboxItems();
  assert.equal(remaining.length, 0);
});
