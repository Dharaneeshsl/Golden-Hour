const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const path = require("path");
const os = require("os");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const { JsonStore } = require("../src/config/db");

process.env.JWT_SECRET = "contract-test-secret-key-12345678";
process.env.ADMIN_WALLETS = "0x0000000000000000000000000000000000000003";

const testWallet = "0x0000000000000000000000000000000000000001";
const doctorWallet = "0x0000000000000000000000000000000000000002";
const adminWallet = "0x0000000000000000000000000000000000000003";

const adminToken = jwt.sign({ wallet: adminWallet, role: "admin" }, process.env.JWT_SECRET, { issuer: "goldenhour" });
const patientToken = jwt.sign({ wallet: testWallet, role: "patient", patientId: "patient-test-id" }, process.env.JWT_SECRET, { issuer: "goldenhour" });

test("Contract: Every frontend api.* endpoint exists on the backend Express server", async () => {
  const store = new JsonStore(path.join(os.tmpdir(), `gh-contract-${Date.now()}.json`));
  await store.addPatient({
    id: "patient-test-id",
    wallet: testWallet,
    profile: { name: "Test Patient" },
    critical: { bloodGroup: "O+" },
    createdAt: new Date().toISOString(),
  });
  await store.addProvider({
    id: "provider-test-id",
    wallet: doctorWallet,
    name: "Dr. Test",
    licenseNumber: "MED-999",
    specialty: "Emergency Medicine",
    status: "verified",
    createdAt: new Date().toISOString(),
  });

  const app = await createApp({
    store,
    chain: { enabled: false },
    encryption: {
      encryptJson: (x) => ({ version: 1, algorithm: "aes-256-gcm", iv: "a", tag: "b", ciphertext: "c" }),
      decryptJson: () => ({}),
    },
    ipfs: {
      uploadEncrypted: async () => ({ cid: "QmTest", persisted: true }),
      fetchEncrypted: async () => ({ version: 1, algorithm: "aes-256-gcm", iv: "a", tag: "b", ciphertext: "c" }),
    },
  });

  const apiContract = [
    { name: "api.nonce", method: "get", path: `/api/auth/nonce/${testWallet}`, token: null },
    { name: "api.verify", method: "post", path: "/api/auth/verify", token: null, body: {} },
    { name: "api.me", method: "get", path: "/api/patients/me", token: patientToken },
    { name: "api.patient", method: "get", path: "/api/patients/patient-test-id", token: patientToken },
    { name: "api.allPatients", method: "get", path: "/api/patients/all", token: adminToken },
    { name: "api.registerPatient", method: "post", path: "/api/patients", token: patientToken, body: {} },
    { name: "api.updatePatient", method: "put", path: "/api/patients/patient-test-id", token: patientToken, body: {} },
    { name: "api.records", method: "get", path: "/api/records/patient-test-id", token: patientToken },
    { name: "api.recordDetail", method: "get", path: "/api/records/patient-test-id/record-test-id", token: patientToken },
    { name: "api.addRecord", method: "post", path: "/api/records", token: patientToken, body: {} },
    { name: "api.emergency", method: "post", path: "/api/emergency-access", token: patientToken, body: {} },
    { name: "api.emergencyCritical", method: "get", path: "/api/emergency-access/critical/grant-id-123", token: patientToken },
    { name: "api.audit", method: "get", path: "/api/emergency-access/patient-test-id", token: patientToken },
    { name: "api.recentAudits", method: "get", path: "/api/emergency-access/recent/all", token: adminToken },
    { name: "api.providerAccess", method: "get", path: "/api/doctors/access", token: patientToken },
    { name: "api.registerProvider", method: "post", path: "/api/doctors/register", token: patientToken, body: {} },
    { name: "api.providers", method: "get", path: "/api/doctors", token: adminToken },
    { name: "api.updateProviderStatus", method: "patch", path: `/api/doctors/${doctorWallet}/status`, token: adminToken, body: {} },
    { name: "api.consents", method: "get", path: "/api/consents/patient-test-id", token: patientToken },
    { name: "api.providerConsents", method: "get", path: "/api/consents/provider", token: patientToken },
    { name: "api.grantConsent", method: "post", path: "/api/consents/patient-test-id", token: patientToken, body: { wallet: doctorWallet } },
    { name: "api.revokeConsent", method: "post", path: "/api/consents/patient-test-id/revoke", token: patientToken, body: {} },
    { name: "api.exportFhir", method: "get", path: "/api/compliance/export/patient-test-id", token: patientToken },
    { name: "api.submitDSR", method: "post", path: "/api/compliance/dsr", token: patientToken, body: { requestType: "access" } },
  ];

  for (const route of apiContract) {
    const req = request(app)[route.method](route.path);
    if (route.token) req.set("Authorization", `Bearer ${route.token}`);
    if (route.body) req.send(route.body);
    const res = await req;

    const isUnrouted = res.status === 404 && typeof res.text === "string" && res.text.startsWith("Cannot ");
    assert.equal(
      isUnrouted,
      false,
      `API Contract Violation: Frontend calls ${route.name} (${route.method.toUpperCase()} ${route.path}), but backend has no matching route (Express returned 404 Cannot)`
    );
  }
});
