# 🏥 GoldenHour

> **Privacy-First Emergency Medical Information Access System with Web3 Wallet Auth, Patient Consent Control, AES-256-GCM Encryption, PostgreSQL Persistence, and Ethereum Blockchain Auditability.**

GoldenHour is a production-grade healthcare technology platform demonstrating how critical medical data can be accessed instantly in life-threatening emergencies **without sacrificing patient privacy or data sovereignty**.

---

## 🚀 Architecture Overview

```
                          ┌──────────────────────────┐
                          │   React 18 + Vite Web App│
                          └─────────────┬────────────┘
                                        │ HTTPS / JSON RPC
                                        ▼
                          ┌──────────────────────────┐
                          │   Express REST API Engine│
                          │ ├── Wallet Auth (JWT)    │
                          │ ├── Provider Lifecycle   │
                          │ ├── Consent Enforcement  │
                          │ └── Audit Logging        │
                          └───────┬───────┬───────┬──┘
                                  │       │       │
              ┌───────────────────┘       │       └───────────────────┐
              ▼                           ▼                           ▼
  ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
  │ PostgreSQL Database   │   │ Decentralized IPFS    │   │  Ethereum / Hardhat   │
  │ - Metadata & Indexing │   │ - Encrypted Payloads  │   │  - Smart Contracts    │
  │ - Audit Logs & Scope  │   │ - AES-256-GCM Storage │   │  - Proof Commitments  │
  └───────────────────────┘   └───────────────────────┘   └───────────────────────┘
```

---

## ✨ Core Features & Technical Implementation

### 1. Web3 EIP-191 Wallet Authentication & Address Canonicalization
- Cryptographic challenge-response authentication using random cryptographic nonces and signature verification.
- **Strict Canonicalization:** All wallet addresses are normalized using `ethers.getAddress(...)` across authentication, database storage, and authorization queries to prevent case-sensitivity bugs or identity duplicates.
- **Provider Role Synchronization:** Role assignment dynamically checks provider verification status. Suspended providers are automatically demoted to patient-level role access.

### 2. Provider Verification & Suspension Governance (`pending` → `verified` → `suspended`)
- **Full Governance Lifecycle:** Clinicians submit professional credentials (name, license number, specialty).
- **Admin Control:** Administrators approve or suspend providers via dedicated endpoints (`PATCH /api/doctors/:wallet/status`).
- **Real-Time Revocation:** Suspended providers lose access to consented records and emergency break-glass functions immediately.

### 3. Patient-Controlled Consent Management & Scope Whitelisting
- Patients explicitly grant and revoke record access to specific verified clinicians.
- **Scope Whitelisting:** Consent scope is strictly validated against an allowed whitelist (`['records']`) to prevent scope injection or data pollution.
- Clinicians can query their active consented patient grants via `GET /api/consents/provider`.

### 4. Time-Bounded (15-Minute) Emergency Break-Glass Workflow
- In life-threatening situations where consent cannot be requested, verified clinicians trigger emergency break-glass access with mandatory clinical justification.
- **View-Level Audit Logging:** Access creates a 15-minute time-bounded session. Every individual view of the critical payload triggers a dedicated audit log (`EMERGENCY_CRITICAL_VIEW`).
- **Dynamic Re-verification:** Clinician status is re-verified upon critical data retrieval to block suspended providers from abusing active break-glass tokens.

### 5. Encrypted Record Persistence & Payload Integrity Verification
- Clinical records are encrypted on the backend using **AES-256-GCM** with unique initialization vectors (IV) and authentication tags before being pinned to IPFS.
- **SHA-256 Pre-Decryption Check:** Before decrypting fetched IPFS content, the backend recomputes the SHA-256 hash of the encrypted payload and verifies it against the database record hash (`encrypted_hash`) to guard against content tampering.

### 6. Dynamic, Idempotent PostgreSQL Migration System
- Dynamic migration runner ([backend/src/config/migrate.js](file:///c:/Users/welcome/Desktop/Golden-Hour/Golden-Hour/backend/src/config/migrate.js)) automatically discovers and transactionally executes all `.sql` scripts in alphabetical order.
- Tracks migration state using a `schema_migrations` table to ensure safe, idempotent database boots across staging and production deployments.

### 7. Ethereum Smart Contract Layer
- Solidity contracts (`PatientRegistry`, `AccessControl`, `MedicalRecord`, `EmergencyAccess`, `AuditLog`) maintain on-chain patient identity hashes, verified provider roles, record CID commitments, and emergency event logs.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, React Router v6, QRCode.react, Ethers.js v6 |
| **Backend** | Node.js 20+, Express.js, Helmet, Express-Rate-Limit, JSON Web Tokens (JWT) |
| **Database** | PostgreSQL 16 (`pg`), Idempotent SQL Migrations |
| **Storage & Security** | AES-256-GCM Encryption, IPFS / Pinata API Gateway |
| **Smart Contracts** | Solidity 0.8.24, Hardhat, OpenZeppelin Contracts v5 |
| **DevOps & CI** | Docker, Docker Compose, GitHub Actions |

---

## 🗄️ Database Schema & Migrations

The database setup uses transactional PostgreSQL migrations located in `backend/migrations/`:

| Migration File | Purpose | Key Tables Created |
|---|---|---|
| `001_initial.sql` | Base schema setup | `patients`, `providers`, `records`, `audit_logs` |
| `002_consents.sql` | Patient-provider consent framework | `patient_provider_consents` |

### Table Definitions Overview

- **`patients`**: Stores patient UUID, canonical wallet address, profile JSON, and critical medical JSON.
- **`providers`**: Tracks clinician credentials, verification status (`pending`, `verified`, `suspended`), and verifier metadata.
- **`records`**: Stores encrypted IPFS payload CIDs, record types, clinician IDs, and SHA-256 payload hashes.
- **`patient_provider_consents`**: Tracks active/revoked patient-to-provider access grants and scope arrays.
- **`audit_logs`**: Append-only log of security, access, and break-glass emergency actions with metadata and timestamps.

Run migrations against a PostgreSQL database:
```bash
npm --prefix backend run db:migrate
```

---

## ⚙️ REST API Reference

### Authentication & Self-Identity
- `GET  /api/auth/nonce/:wallet` — Generate authentication nonce for wallet signature.
- `POST /api/auth/verify` — Verify EIP-191 signature and issue JWT bearer token.

### Patient Management
- `GET  /api/patients/me` — Fetch current authenticated patient identity.
- `POST /api/patients` — Register new patient identity and critical medical context.
- `PUT  /api/patients/:id` — Update profile or critical medical info (triggers smart contract hash sync).
- `GET  /api/patients/all` — Admin route to list registered patient identities.
- `GET  /api/patients/:id` — Retrieve patient profile, records timeline, and audit logs.

### Provider Management
- `GET  /api/doctors/access` — Fetch current authenticated provider status and clinical permissions.
- `POST /api/doctors/register` — Register clinician account (`pending` status).
- `GET  /api/doctors` — List registered providers filtered by status (Admin only).
- `POST /api/doctors/:wallet/verify` — Approve provider account (`verified` status, Admin only).
- `PATCH /api/doctors/:wallet/status` — Update provider status (`pending`, `verified`, `suspended`, Admin only).

### Consent Management
- `GET  /api/consents/provider` — List active patients who granted consent to the calling clinician.
- `GET  /api/consents/:patientId` — List active/revoked consents for a patient.
- `POST /api/consents/:patientId` — Grant access consent to a verified clinician (`scope: ["records"]`).
- `POST /api/consents/:patientId/revoke` — Revoke access consent from a clinician.

### Encrypted Records
- `POST /api/records` — Encrypt clinical JSON, pin to IPFS, and save record (Requires active consent).
- `GET  /api/records/:patientId` — List encrypted records for a patient.
- `GET  /api/records/:patientId/:recordId` — Fetch from IPFS, verify payload hash, decrypt and return data.

### Emergency Access & Audit
- `POST /api/emergency-access` — Trigger 15-minute emergency break-glass session with justification.
- `GET  /api/emergency-access/critical/:accessId` — Retrieve critical medical payload (Audited on every fetch).
- `GET  /api/emergency-access/recent/all` — List recent emergency audit events across all patients (Admin only).

---

## 🚦 Local Setup & Running Instructions

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose (or local PostgreSQL)

### 1. Repository Setup & Dependencies
```bash
git clone https://github.com/Dharaneeshsl/Golden-Hour.git
cd Golden-Hour
npm run install:all
```

### 2. Environment Configuration
Copy `.env.example` to `backend/.env`:
```bash
cp backend/.env.example backend/.env
```
Generate a 256-bit symmetric encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Update `backend/.env`:
```env
PORT=4000
JWT_SECRET=your-secure-random-jwt-secret
ENCRYPTION_KEY=your-generated-base64-encryption-key
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://goldenhour:goldenhour-dev-only@localhost:5432/goldenhour
ADMIN_WALLETS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### 3. Run Database Migrations
Start local Postgres database and run migrations:
```bash
npm --prefix backend run db:migrate
```

### 4. Compile & Deploy Smart Contracts (Optional Local Node)
```bash
npm run compile
npm run node
# In a separate terminal:
npm run deploy:local
```

### 5. Start Backend & Frontend Development Servers
```bash
npm run backend
# In a separate terminal:
npm run frontend
```
- **Frontend App:** `http://localhost:5173`
- **Backend API:** `http://localhost:4000/health`

---

## 🐳 Docker Deployment

To spin up the entire application stack (PostgreSQL, Backend API with automatic migrations, and Frontend):

```bash
docker compose up --build
```

The Compose configuration includes:
- **`postgres`**: PostgreSQL 16 with health checks and persistent volume `postgres_data`.
- **`backend`**: Node.js 20 service running automatic database migrations and API server.
- **`frontend`**: Production container serving the optimized React client on port 3000.

---

## 🧪 Quality Assurance & Test Verification

GoldenHour includes comprehensive test coverage across backend integration, smart contracts, and frontend modules:

```bash
# Run backend integration tests
npm --prefix backend test

# Run Solidity smart contract tests
npx hardhat test

# Run frontend Vitest suite
npm --prefix frontend test

# Validate full production frontend build
npm --prefix frontend run build
```

---

## 📄 License & Clinical Notice

> ⚠️ **Clinical Safety Notice:** GoldenHour is an advanced architectural and engineering portfolio demonstration. It must undergo independent clinical review, legal compliance audit (HIPAA/GDPR), and formal penetration testing prior to deployment in real healthcare settings.
