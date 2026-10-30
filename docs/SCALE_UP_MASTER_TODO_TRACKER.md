# 🏥 GoldenHour: Engineering Remediation & Scale-Up Tracker

> **Tracking Framework:** Seven-Step Remediation Plan (Honest Status Model)  
> **Status Taxonomy:** **Done** (verified by passing tests / CI check / deployed code) | **Partial** (active implementation in progress) | **Schema only** (DDL tables exist in migration 004, no code reads/writes) | **Not started** (backlog)  
> **Last Verified:** October 30, 2026 · Automated Test Suite Passing (20 Backend + 12 Frontend + 6 Smart Contract + CI Secret Scan)

---

## 📊 Live Verification Baseline

```
================================================================================
  GOLDENHOUR ENGINE BENCHMARK: 100% SUITE PASSING
================================================================================
  [Done] CI Secret & Demo Scan    : 0 VIOLATIONS   (scripts/ciSecretScan.js)
  [Done] Solidity Smart Contracts : 6 / 6 PASSING   (Hardhat EVM test suite)
  [Done] Backend Syntax Validator : 28 / 28 PASSING (All 28 production files)
  [Done] Backend Integration Suite: 20 / 20 PASSING (Auth, Crypto, DB, Emergency,
                                                    Route Contract, Envelope Encryption,
                                                    FHIR IPS, Compliance Lockdown)
  [Done] Frontend Unit & Render   : 12 / 12 PASSING (Vitest: Session, Web3,
                                                    Emergency Views, All 5 Dashboards)
  [Done] Frontend Production Build: SUCCESS         (Vite v5.4.21 bundle clean)
  [Done] Production Migrations    : 001, 002, 003, 004 (Schema v2, 15 tables)
================================================================================
```

---

## 📋 Seven-Step Remediation Roadmap

### Step 1: Stop the breakage (this week)
- [Done] **Emergency UI State Declaration**: Declared `reasonCode` and `facility` state in `DoctorDashboard.jsx` and `EmergencyScanView.jsx`, and added clinical reason select and facility input fields to the emergency view. *(Proof: `frontend/src/components/emergencyComponents.test.jsx`)*
- [Done] **FHIR Export Button**: Added the FHIR R4 IPS export button by hand to `PatientDashboard.jsx`. *(Proof: Verified in component JSX and production build)*
- [Done] **Emergency Component Render Tests**: Added frontend test that renders both emergency components via `renderToString`, guaranteeing any undeclared state or syntax crash fails CI. *(Proof: `frontend/src/components/emergencyComponents.test.jsx`)*
- [Done] **Lock down `/api/compliance/*`**:
  - Export: Strictly authorized to the patient themselves; verified caller wallet and patientId match target. *(Proof: `backend/test/scaleup.test.js`)*
  - DSR: Strictly authorized patients only, with `patientId` derived directly from authenticated token/database lookup, ignoring request body. *(Proof: `backend/test/scaleup.test.js`)*
  - Erasure: Disabled with HTTP 503 pending Step 4 legal-hold verification and persistent KMS integration. *(Proof: `backend/test/scaleup.test.js`)*
- [Done] **Grievance Officer Persona Remediation**: Removed the placeholder grievance officer endpoint (`/api/compliance/grievance-officer`) to eliminate invented persona until formal DPO appointment in Step 6.
- [Done] **Production SSL & CA Enforcement**: Set `DB_REJECT_UNAUTHORIZED` to `true` by default and enforce mandatory `DB_CA` file in production when `DB_SSL=true`. *(Proof: `getDbSslConfig` in `backend/src/config/db.js` and `backend/src/config/migrate.js`)*
- [Done] **Dedicated Client Migration Advisory Lock**: Refactored migration runner to acquire dedicated connection client from pool, executing advisory lock, schema migrations, and unlock on that single connection. *(Proof: `backend/src/config/migrate.js`)*
- [Done] **Realistic Notification Status**: Changed `notificationService` to return `LOGGED_ONLY` status until a real SMS/telephony provider (e.g. Twilio/Karix) is connected. *(Proof: `backend/test/scaleup.test.js`)*
- [Done] **API Route Integrity & Regression Tests**:
  - Restored full `api` object in `frontend/src/api.js` mapping accurately to backend routes.
  - Added route contract test `backend/test/routeContract.test.js` validating all 24 frontend API endpoints against Express.
  - Added app-level mounting test `frontend/src/components/dashboardMount.test.jsx` verifying Patient, Doctor, Admin, Emergency, and Onboarding views render cleanly with mocked fetch.
- [Done] **Wording & Legal Cleanup**:
  - Corrected `i18n.js` to state that emergency reads are logged in patient audit history (removing incorrect "on-chain" claim and removing Section 12 penalty citation).
  - Updated DSR endpoint message to accurately state that requests are recorded in the audit trail (removing "queued for statutory processing").

---

### Step 2: Finish the demo and dev cleanup (R1 to R16)
- [Done] **Delete Demo Sign-In Route Code**: Removed `DEMO_WALLETS`, `DEMO_LOGIN_ENABLED`, and demo signature bypass in `authRoutes.js`. Enforced pure EIP-191 cryptographic verification. *(Proof: `scripts/ciSecretScan.js`)*
- [Done] **Delete Demo Accounts & Buttons**: Deleted `demoAccounts.js`, removed demo sign-in buttons from `login.jsx`, and removed `isDemoWallet` check from `App.jsx`. *(Proof: `scripts/ciSecretScan.js`)*
- [Done] **Delete Seed Scripts**: Deleted `seed.js` and `scripts/seedTestData.js`. *(Proof: Verified deleted from filesystem)*
- [Done] **Remove Demo Envs & Defaults**: Removed `DEFAULT_DEMO_ADMINS` and `ALLOW_DEMO_LOGIN` from every `.env.example`, `backend/.env`, and `docker-compose.yml`. *(Proof: `scripts/ciSecretScan.js`)*
- [Done] **Remove Hardcoded Hardhat Key**: Removed private key `"0xac09..."` from `wireLocalDeployment.js`, and added guard refusing non-local networks. *(Proof: `scripts/ciSecretScan.js`)*
- [Done] **Centralize JWT Secret & Remove Fallbacks**: Removed dev JWT fallback in `authRoutes.js` and wired centralized `getJwtSecret` from `authConfig.js`.
- [Partial] Delete the IPFS mock and `JsonStore`. Change tests to use a real Postgres container.
- [Done] **Split Docker Compose**: Created `docker-compose.dev.yml` for local dev and hardened `docker-compose.yml` for production without demo vars or weak secrets.
- [Done] **Startup Configuration Validator**: Added `backend/src/config/validateConfig.js` called at startup, verifying `JWT_SECRET` strength, `ENCRYPTION_KEY` length, and production variables.
- [Done] **CI Secret & Demo Scan**: Added `scripts/ciSecretScan.js` and wired into `npm run check`, failing CI on any detection of `DEMO_`, `demoAccounts`, `local-development-secret`, or private keys.
- [Done] **Documentation Reality Alignment**: Rewrote `README.md` and `docs/api.md` to remove "production-grade" claims, clarify 15m JWT TTL, and document all 24 API routes accurately.

---

### Step 3: Make the security bugs real fixes
- [Not started] Add an async error wrapper, or move to Express 5 (B8).
- [Not started] Move nonces, rate limits and sessions to Redis (B9).
- [Not started] Add SIWE (EIP-4361) for wallet sign-in (B10).
- [Partial] Use short access tokens (15m implemented), rotating refresh cookies and server-side revocation. Remove `localStorage` tokens (B11).
- [Not started] Remove admin access to decrypt records and to list all patients (B5).
- [Partial] Encrypt stored emergency justification (B6) (Currently stored in plaintext in audit metadata; encryption pending).
- [Schema only] Add rate limit per provider on break-glass requests, and a review queue (B7) (`break_glass_reviews` table created in migration 004; logic not wired).
- [Schema only] Add expiry and purpose to consent (B17) (`consents_v2` table created in migration 004; logic not wired).
- [Schema only] Add transactional outbox for chain writes (B13) (`outbox` table created in migration 004; logic not wired).
- [Partial] Add pagination to every list endpoint (B18 indexes added in migration 003; offset/limit logic pending).
- [Not started] Remove chain metadata (record type, doctor, CID). Use anchoring only, or drop the chain (B15, B4).

---

### Step 4: Make encryption and audit real
- [Schema only] Store wrapped keys in `key_registry` table (`key_registry` table created in migration 004; database storage and KMS integration not wired).
- [Not started] Use real cloud KMS (AWS KMS / GCP Cloud KMS / HashiCorp Vault) for the master key. Remove deterministic fallback from `ENCRYPTION_KEY`.
- [Service scaffolded, unwired] Wire envelope encryption into record, patient `profile` and `critical` paths (B2, B3) (Service built & unit-tested in `envelopeEncryptionService.js`; controllers not yet migrated).
- [Not started] Migrate existing data to new encryption, and test key rotation.
- [Partial] Implement erasure properly, then re-enable endpoint. Run only after legal-hold check with immutable audit entry.
- [Schema only] Persist hash-chained audit log in `audit_events` table (Service built & unit-tested in `auditChainService.js`; database persistence not wired).
- [Not started] Remove cascade deletes and revoke `UPDATE` and `DELETE` on audit tables.
- [Partial] Add a worker that anchors Merkle root on schedule (Merkle calculation built & tested in `auditChainService.js`).
- [Not started] Move record storage from Pinata to S3-compatible storage with SSE-KMS and object lock (B21).

---

### Step 5: Proof that it all works
- [Not started] Add generated authorization matrix test: every role × endpoint × consent state.
- [Partial] Add Postgres integration tests for every store method and migration (migrations 001-004 validated).
- [Not started] Add Playwright end-to-end tests for patient, doctor, emergency and admin flows.
- [Done] **Regression Test Suite**: Added regression tests for compliance authorization holes, emergency crash, frontend API route contracts (`backend/test/routeContract.test.js`), and dashboard mounts (`frontend/src/components/dashboardMount.test.jsx`).
- [Not started] Add ESLint, type checker, Dependabot, SAST and container scan to CI.
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
- [Done] Replaced all over-generous statuses with strict **Done**, **Partial**, **Schema only**, and **Not started** states.
- [Done] Enforced strict evidence gate: Items are only marked **Done** when verified by passing automated tests, CI scans, or verified code.
