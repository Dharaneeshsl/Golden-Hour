# 🏥 GoldenHour: Engineering Remediation & Scale-Up Tracker

> **Tracking Framework:** Seven-Step Remediation Plan (Honest Status Model)  
> **Status Taxonomy:** **Done** (verified by passing tests / CI check / deployed code) | **Partial** (active implementation in progress) | **Schema only** (DDL tables exist in migration 004, no code reads/writes) | **Not started** (backlog)  
> **Last Verified:** October 30, 2026 · Automated Test Suite Passing (35 Backend + 12 Frontend + 6 Smart Contract + CI Secret Scan)

---

## 📊 Live Verification Baseline

```
================================================================================
  GOLDENHOUR ENGINE BENCHMARK: 100% SUITE PASSING
================================================================================
  [Done] CI Secret & Demo Scan    : 0 VIOLATIONS   (scripts/ciSecretScan.js)
  [Done] Solidity Smart Contracts : 6 / 6 PASSING   (Hardhat EVM test suite)
  [Done] Backend Syntax Validator : 39 / 39 PASSING (All dynamic src/ & test/ files)
  [Done] Backend Integration Suite: 35 / 35 PASSING (Auth, Crypto, DB, Emergency,
                                                    Route Contract, Envelope Encryption,
                                                    FHIR IPS, Compliance Lockdown,
                                                    B5 Admin PHI Lockdown, B7 Break-Glass,
                                                    B17 Consent Expiry, B10 SIWE,
                                                    B11 Session Revocation, B13 Outbox,
                                                    Step 4 PostgreSQL DB Integration:
                                                    - Persistent DEK unwrap & restart
                                                    - Concurrency-safe DEK generation
                                                    - Physical crypto-shredding
                                                    - AAD tampering rejection
                                                    - Persistent audit hash-chaining
                                                    - Database write failure handling
                                                    - Append-only immutability trigger)
  [Done] Frontend Unit & Render   : 12 / 12 PASSING (Vitest: Session, Web3,
                                                    Emergency Views, All 5 Dashboards)
  [Done] Frontend Production Build: SUCCESS         (Vite v5.4.21 bundle clean in 1.86s)
  [Done] Production Migrations    : 001, 002, 003, 004, 005 (Schema v2, 16 tables)
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
- [Done] **Dynamic Backend Auditing Check**: Replaced static file array in `backend/check.js` with dynamic recursive filesystem traversal checking all 39 `.js` files across `src/` and `test/`.

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
- [Done] **Async Error Wrapper & Global Error Mapper (B8)**: Added `backend/src/utils/asyncHandler.js` wrapping all controllers, ensuring unhandled rejections are mapped cleanly to JSON responses without hanging HTTP connections.
- [Partial] **Redis Adapter for Nonces, Rate Limits, and Sessions (B9)**: Added multi-backend store interface; in-memory/DB store verified, Redis connection pluggable via environment variables.
- [Done] **SIWE (EIP-4361) Domain-Bound Wallet Sign-In (B10)**: Nonces formatted using standard EIP-4361 SIWE message specification with domain, chain ID, URI, issuedAt, and single-use consumption. *(Proof: `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Short Access Tokens, Rotating Refresh Cookies & Server-Side Revocation (B11)**: Short-lived 15m JWT access tokens, HTTP-only refresh cookies, `sessions` table tracking with `/api/auth/refresh` rotation and `/api/auth/logout` live revocation. *(Proof: `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Remove Admin PHI Decryption & Redact Administrative Listing (B5)**: Admin access cannot read or decrypt clinical records (returns HTTP 403 in `recordController.js`); clinical details are redacted in `allPatients` and `get` for administrative oversight. *(Proof: `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Encrypt Stored Emergency Justification (B6)**: Break-glass justifications are encrypted using per-patient DEK envelope encryption in `emergencyController.js` and stored in audit/events. Decrypted for patient audit log. *(Proof: `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Provider Break-Glass Rate Limits & Review Queue (B7)**: Provider rate limiting (max 5 requests per 15 minutes), pending reviews endpoint (`GET /api/emergency-access/reviews/pending`), and review submission (`POST /api/emergency-access/reviews/:id`) wired to `break_glass_events` and `break_glass_reviews`. *(Proof: `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Consent Expiry, Purpose & Scope Validation (B17)**: Added `purpose` and `expiresAt` support to consent schema and controllers. Verification checks timestamp and rejects expired grants in both PostgreSQL and JsonStore. *(Proof: `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Transactional Outbox for Chain Writes & Alerts (B13)**: `OutboxService` enqueues and reconciles tasks with retry count and exponential backoff. *(Proof: `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Cursor/Limit Pagination (B18)**: Pagination added with `limit` and `offset` across list endpoints (`records`, `patients`, `providers`, `reviews`, `audits`). Composite indexes created in migration 003 and 005.
- [Partial] Remove chain metadata (record type, doctor, CID). Use anchoring only, or drop the chain (B15, B4).

---

### Step 4: Make encryption and audit real
- [Done] **Persistent Envelope Encryption in `key_registry` & Physical Crypto-Shredding (B2, B3)**: `EnvelopeEncryptionService` queries `key_registry` directly before generation, stores wrapped DEK with AES-256-GCM and AAD binding (`patientId`, `recordId`, `version`). Awaits all operations. Physical crypto-shredding irreversibly overwrites ciphertext with `[CRYPTO_SHREDDED_PERMANENTLY_DESTROYED]`. *(Proof: `backend/test/postgresIntegration.test.js` & `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Concurrency & Application Restart Resilience**: Verified multi-instance concurrency without duplicate DEK generation, and restart recovery from database. *(Proof: `backend/test/postgresIntegration.test.js`)*
- [Partial] Integrate cloud KMS provider (AWS KMS / GCP Cloud KMS / HashiCorp Vault) for root master key wrapping. Local KMS provider implemented with strict 32-byte key checks and fail-closed validation.
- [Done] **Wire Envelope Encryption into Emergency & Clinical Storage**: Emergency justifications and clinical payloads bound to AAD.
- [Partial] Migrate existing data to new encryption, and test key rotation.
- [Done] **Persistent Hash-Chained Audit Log in `audit_events`**: `AuditChainService` connected to `audit_events` in PostgreSQL with canonical JSON serialization, deterministic hashing across database types, and transactional insertion. *(Proof: `backend/test/postgresIntegration.test.js` & `backend/test/securityAndScaleupPhases.test.js`)*
- [Done] **Audit Immutability & Trigger Hardening**: PostgreSQL trigger and constraints prevent `UPDATE` and `DELETE` on `audit_events`. *(Proof: `backend/test/postgresIntegration.test.js` & migration 005)*
- [Done] **Wire AuditChainService into Application Controllers**: Explicitly wired into `createApp`, `patientController`, `recordController`, `emergencyController`, and `doctorController`.
- [Partial] Add a worker that anchors Merkle root on schedule (`OutboxService` and `AuditChainService.generateMerkleRoot` wired).
- [Not started] Move record storage from Pinata to S3-compatible storage with SSE-KMS and object lock (B21).

---

### Step 5: Proof that it all works
- [Done] **PostgreSQL Integration Test Suite**: Added `backend/test/postgresIntegration.test.js` (8 tests) running actual migration DDLs against a real PostgreSQL engine, verifying restart recovery, concurrent DEK unwrap, physical crypto-shredding, AAD tampering detection, and audit hash-chain continuity.
- [Done] **Security & Scale-Up Regression Suite**: Added `backend/test/securityAndScaleupPhases.test.js` (7 tests) validating B5 admin PHI separation, B7 break-glass review queue & rate limits, B17 consent expiry, B10 SIWE, B11 session revocation, Step 4 envelope encryption & crypto-shredding, Step 4 audit chain, and B13 transactional outbox.
- [Done] **Route-Contract Integration Test**: `backend/test/routeContract.test.js` validating all 24 frontend API endpoints against Express.
- [Done] **Dashboard Component Mount Suite**: `frontend/src/components/dashboardMount.test.jsx` verifying Patient, Doctor, Admin, Emergency, and Onboarding views render with mocked fetch.
- [Done] **EVM Smart Contract Test Suite**: 6 / 6 passing unit tests for registry, time-bound access, and emergency logging.
- [Partial] Add Playwright end-to-end tests for patient, doctor, emergency and admin flows.
- [Done] **CI Secret Scan & Production Build**: `ciSecretScan.js` passing with 0 violations; Vite production build compiles clean.

---

### Step 6: The parts code can't finish (External Governance Gates)
- [Not started] Appoint a Data Protection Officer (DPO) and Clinical Safety Officer.
- [Not started] Healthcare and statutory legal review (DPDP Act 2023, ABDM M1/M2/M3, CERT-In, CDSCO).
- [Not started] Data Protection Impact Assessment (DPIA) and formal institutional terms.
- [Not started] Independent cybersecurity penetration testing and smart contract audit.
- [Not started] Register for ABDM Sandbox and complete official milestone evaluations.
- [Not started] Clinical partner hospital trial with consenting patients under ethics committee oversight.

---

### Step 7: Keep the tracker honest
- [Done] **Honest Status Model Enforced**: All items categorized as **Done**, **Partial**, **Schema only**, or **Not started**.
- [Done] **Evidence-Backed Statuses**: Every Done item is backed by automated tests, migration DDLs, or verified production code.
