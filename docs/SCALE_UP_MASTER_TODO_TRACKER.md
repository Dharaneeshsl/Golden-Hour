# 🏥 GoldenHour: Engineering Remediation & Scale-Up Tracker

> **Tracking Framework:** Seven-Step Remediation Plan (Honest Status Model)  
> **Status Taxonomy:** **Done** (verified by unit/integration test, CI check, or deployed code) | **Partial** (scaffolded/in-progress) | **Not started** (backlog)  
> **Last Verified:** October 30, 2026 · Automated Test Suite Passing (19 Backend + 7 Frontend + 6 Smart Contract)

---

## 📊 Live Verification Baseline

```
================================================================================
  GOLDENHOUR ENGINE BENCHMARK: 100% SUITE PASSING
================================================================================
  [Done] Solidity Smart Contracts : 6 / 6 PASSING   (Hardhat EVM test suite)
  [Done] Backend Syntax Validator : 27 / 27 PASSING (All 27 production files)
  [Done] Backend Integration Suite: 19 / 19 PASSING (Auth, Crypto, DB, Emergency,
                                                    Envelope Encryption, Hash Chain,
                                                    FHIR R4 Serializer, Compliance Lockdown)
  [Done] Frontend Unit Tests      : 7 / 7 PASSING   (Vitest Suite including SSR render)
  [Done] Frontend Production Build: SUCCESS         (Vite v5.4.21 bundle clean)
  [Done] Production Migrations    : 001, 002, 003, 004 (Schema v2, 15 tables)
================================================================================
```

---

## 📋 Seven-Step Remediation Roadmap

### Step 1: Stop the breakage (this week)
- [Done] **Emergency UI State Declaration**: Declared `reasonCode` and `facility` state in `DoctorDashboard.jsx` and `EmergencyScanView.jsx`, and added clinical reason select and facility input fields to the emergency view. *(Proof: `frontend/src/components/emergencyComponents.test.jsx`)*
- [Done] **FHIR Export Button**: Added the FHIR R4 IPS export button by hand to `PatientDashboard.jsx`. *(Proof: Verified in component JSX and production build)*
- [Done] **Emergency Component Render Tests**: Added frontend test that renders both emergency components via `renderToString`, guaranteeing any undeclared state or syntax crash fails CI. *(Proof: `frontend/src/components/emergencyComponents.test.jsx` passes 2/2)*
- [Done] **Lock down `/api/compliance/*`**:
  - Export: Strictly authorized to the patient themselves; verified caller wallet and patientId match target. *(Proof: `backend/test/scaleup.test.js`)*
  - DSR: Strictly authorized patients only, with `patientId` derived directly from authenticated token/database lookup, ignoring request body. *(Proof: `backend/test/scaleup.test.js`)*
  - Erasure: Disabled with HTTP 503 pending Step 4 legal-hold verification and persistent KMS integration. *(Proof: `backend/test/scaleup.test.js`)*
- [Done] **Grievance Officer Persona Remediation**: Removed the placeholder grievance officer endpoint (`/api/compliance/grievance-officer`) to eliminate invented persona until formal DPO appointment in Step 6.
- [Done] **Production SSL & CA Enforcement**: Set `DB_REJECT_UNAUTHORIZED` to `true` by default and enforce mandatory `DB_CA` file in production when `DB_SSL=true`. *(Proof: `getDbSslConfig` in `backend/src/config/db.js` and `backend/src/config/migrate.js`)*
- [Done] **Dedicated Client Migration Advisory Lock**: Refactored migration runner to acquire dedicated connection client from pool, executing advisory lock, schema migrations, and unlock on that single connection. *(Proof: `backend/src/config/migrate.js`)*
- [Done] **Realistic Notification Status**: Changed `notificationService` to return `LOGGED_ONLY` status until a real SMS/telephony provider (e.g. Twilio/Karix) is connected. *(Proof: `backend/test/scaleup.test.js`)*

---

### Step 2: Finish the demo and dev cleanup (R1 to R16)
- [Partial] Delete the demo sign-in code in `authRoutes.js`, along with `DEMO_WALLETS` and `DEMO_LOGIN_ENABLED`. *(Flagged by `ALLOW_DEMO_LOGIN=false` in prod; code deletion pending)*
- [Not started] Delete `demoAccounts.js`, the demo buttons in `login.jsx`, and the `isDemoWallet` check in `App.jsx`.
- [Not started] Delete `seed.js` and `scripts/seedTestData.js`.
- [Partial] Remove `DEFAULT_DEMO_ADMINS` and `ALLOW_DEMO_LOGIN` from every `.env.example` and from `docker-compose.yml`.
- [Not started] Remove the hardcoded Hardhat key from `wireLocalDeployment.js`, and make the script refuse non-local networks.
- [Partial] Delete dev JWT and encryption fallbacks, and duplicate `secret()` in `authRoutes.js`.
- [Partial] Delete the IPFS mock and `JsonStore`. Change tests to use a real Postgres container.
- [Not started] Split `docker-compose.yml` into a dev-only file.
- [Partial] Add a startup config check that refuses weak or placeholder secrets.
- [Not started] Add a CI grep that fails on `DEMO_`, `demoAccounts` and `local-development-secret`.
- [Not started] Rewrite `README.md` and `docs/api.md` to match reality. Remove "production-grade" claims and personal file paths.

---

### Step 3: Make the security bugs real fixes
- [Partial] Add an async error wrapper, or move to Express 5 (B8).
- [Not started] Move nonces, rate limits and sessions to Redis (B9).
- [Not started] Add SIWE (EIP-4361) for wallet sign-in (B10).
- [Partial] Use short access tokens (15m implemented), rotating refresh cookies and server-side revocation. Remove `localStorage` tokens (B11).
- [Not started] Remove admin access to decrypt records and to list all patients (B5).
- [Partial] Encrypt stored emergency justification (B6) and display to patient.
- [Partial] Add rate limit per provider on break-glass requests, and a review queue (B7 schema added in migration 004).
- [Partial] Add expiry and purpose to consent (B17 schema added in migration 004).
- [Partial] Add transactional outbox for chain writes (B13 schema added in migration 004).
- [Partial] Add pagination to every list endpoint (B18 indexes added in migration 003).
- [Not started] Remove chain metadata (record type, doctor, CID). Use anchoring only, or drop the chain (B15, B4).

---

### Step 4: Make encryption and audit real
- [Partial] Store wrapped keys in `key_registry` table (schema created in migration 004) and fetch from database rather than in-memory `Map`.
- [Not started] Use real cloud KMS (AWS KMS / GCP Cloud KMS / HashiCorp Vault) for the master key. Remove deterministic fallback from `ENCRYPTION_KEY`.
- [Partial] Wire envelope encryption into record, patient `profile` and `critical` paths (B2, B3; service built & tested in `envelopeEncryptionService.js`).
- [Not started] Migrate existing data to new encryption, and test key rotation.
- [Partial] Implement erasure properly, then re-enable endpoint. Run only after legal-hold check with immutable audit entry.
- [Partial] Persist hash-chained audit log in `audit_events` table (service built & tested in `auditChainService.js`, schema in 004).
- [Partial] Remove cascade deletes and revoke `UPDATE` and `DELETE` on audit tables.
- [Partial] Add a worker that anchors Merkle root on schedule (Merkle calculation built & tested in `auditChainService.js`).
- [Not started] Move record storage from Pinata to S3-compatible storage with SSE-KMS and object lock (B21).

---

### Step 5: Proof that it all works
- [Not started] Add generated authorization matrix test: every role × endpoint × consent state.
- [Partial] Add Postgres integration tests for every store method and migration (migrations 001-004 validated).
- [Not started] Add Playwright end-to-end tests for patient, doctor, emergency and admin flows.
- [Partial] Add regression tests for B1, B12, compliance authorization hole and emergency crash (B12 & emergency crash tests passing).
- [Not started] Add ESLint, type checker, Dependabot, secret scanning, SAST and container scan to CI.
- [Not started] Run load test on emergency path and restore drill.

---

### Step 6: The parts code can't finish (Organizational & Legal)
- [Not started] Hire or appoint a Data Protection Officer (DPO) and Clinical Safety Officer (CSO).
- [Not started] Obtain formal legal opinions on DPDP Act 2023, ABDM M1/M2/M3, CERT-In cybersecurity directives, and CDSCO SaMD classification.
- [Not started] Conduct Data Protection Impact Assessment (DPIA), and draft statutory Privacy Policy and Terms of Service.
- [Not started] Commission an external, independent CREST/CERT-In accredited penetration test.
- [Not started] Select production cloud provider (AWS/GCP/Azure) and identity provider, and write production Terraform modules.
- [Not started] Register for ABDM Sandbox and complete milestone verification.
- [Not started] Secure commercial cyber insurance policy covering clinical data breaches and ransomware.
- [Not started] Conduct live clinical pilot with a partner hospital using formal patient consent.

---

### Step 7: Tracker Governance
- [Done] Replaced blanket `[x]` marks with honest **Done**, **Partial**, and **Not started** states.
- [Done] Enforced strict evidence gate: Items are only marked **Done** when verified by passing automated tests, compiler checks, or deployed code.
