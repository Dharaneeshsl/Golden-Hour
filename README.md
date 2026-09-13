# 🏥 GoldenHour

> **Privacy-first emergency medical information access with patient consent, verified providers, encryption and blockchain auditability.**

GoldenHour is a full-stack healthcare technology project that demonstrates how emergency medical information can be made available quickly **without giving up patient control and privacy**.

> ⚠️ **Important:** GoldenHour is an engineering and portfolio project. It is **not certified for real clinical use** and must not be used with real patient data without security, compliance and clinical validation.

---

## ✨ What problem does it solve?

In an emergency, doctors may need critical information immediately:

- Allergies
- Blood group
- Chronic conditions
- Emergency contacts
- Important medical history

Traditional systems can be slow or fragmented. GoldenHour models a secure flow where the patient controls normal access, while verified providers can use a **time-limited, audited break-glass workflow** during emergencies.

## 🧠 Architecture at a glance

```
React + Vite Frontend
        │
        │ Wallet authentication / REST API
        ▼
Express Backend
 ├── Authentication
 ├── Provider verification
 ├── Patient consent
 ├── Emergency break-glass
 ├── Encryption
 └── Audit logging
        │
   ┌────┴─────────┐
   ▼              ▼
PostgreSQL       IPFS
Metadata        Encrypted payload
   │
   ▼
Ethereum / Solidity
Audit & record integrity
```

## 🔐 Core security model

### 1. Wallet authentication
```
Wallet → Nonce → Signature → Server verification → JWT
```

A wallet proves ownership of an identity. It does **not** automatically prove medical credentials.

### 2. Provider verification
```
Provider registers
      ↓
PENDING
      ↓
Admin / institution verification
      ↓
VERIFIED
      ↓
Clinical workflows
```

### 3. Patient consent
Normal record access requires:

```
Verified Provider
       +
Active Patient Consent
       =
Record Access
```

Patients can grant, revoke and review provider consent.

### 4. Emergency break-glass

```
Verified Provider
       +
Emergency justification
       ↓
Critical information only
       ↓
Time limited
       ↓
Audited event
```

Emergency access is intentionally separate from normal consent access.

## 🧩 Features

### 👤 Patient
- Wallet-based identity
- Register medical profile
- Manage critical information
- View records
- Grant provider consent
- Revoke provider consent
- View audit history

### 🩺 Provider
- Register as provider
- Pending → verified lifecycle
- Patient-consented record access
- Clinical record creation
- Audited actions

### 🚨 Emergency
- Verified-provider access
- Required justification
- Critical-only scope
- Time-bounded access
- Immutable audit trail model

### 🔒 Security
- Helmet security headers
- Rate limiting
- Request IDs
- JWT authentication
- AES-256-GCM encryption
- Patient ownership checks
- Database-backed provider verification
- Consent enforcement
- Safe IPFS failure handling

## 📁 Project structure

```
Golden-Hour/
├── contracts/          # Solidity smart contracts
├── scripts/            # Contract deployment scripts
├── test/               # Smart contract tests
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── config/
│   └── migrations/     # PostgreSQL schema
├── frontend/
│   └── src/            # React application
├── docs/               # Architecture/API documentation
└── .github/workflows/  # CI
```

## 🚀 Quick start

### Requirements
- Node.js 20+
- npm
- PostgreSQL (recommended)
- MetaMask or compatible EIP-1193 wallet
- Optional: IPFS/Pinata credentials

### Install

```bash
git clone https://github.com/Dharaneeshsl/Golden-Hour.git
cd Golden-Hour
npm run install:all
```

### Configure

```bash
cp backend/.env.example backend/.env
```

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set it as `ENCRYPTION_KEY`.

### Run validation

```bash
npm run check
```

### Start locally

```bash
npm run backend
npm run frontend
```

Frontend: `http://localhost:5173`

Backend health: `http://localhost:4000/health`

## 🗄️ PostgreSQL

GoldenHour supports PostgreSQL for durable persistence.

```bash
npm --prefix backend run db:migrate
```

Main tables:

| Table | Purpose |
|---|---|
| patients | Patient identity and profile metadata |
| providers | Provider verification lifecycle |
| records | Encrypted medical record references |
| audit_logs | Security and clinical audit events |
| patient_provider_consents | Patient-controlled provider access |

## ⛓️ Blockchain

The project includes Solidity contracts for medical record integrity and audit workflows.

```bash
npm run compile
npm test
npm run node
npm run deploy:local
```

Blockchain should store **proofs and references**, not raw medical data.

## 🧪 Quality checks

Run the complete repository validation:

```bash
npm run check
```

CI validates:

- Solidity compilation
- Smart contract tests
- Backend syntax checks
- Backend tests when configured
- Frontend production build
- Frontend tests

## 🐳 Docker

```bash
docker compose up --build
```

The Compose setup includes:

- Backend
- PostgreSQL
- Database health checks

## 🛣️ Request flow

### Normal clinical access

```
Patient
  │ grants consent
  ▼
Provider
  │ must be VERIFIED
  ▼
Authorization middleware
  │
  ▼
Encrypted record metadata
  │
  ├── PostgreSQL
  ├── IPFS
  └── Blockchain proof
```

## 📊 Project maturity

### Strongly implemented
- Frontend/backend architecture
- Wallet identity flow
- Provider lifecycle
- Patient consent
- Emergency workflow
- Encryption foundation
- PostgreSQL adapter
- Smart contract modules
- Docker foundation
- CI workflow

### Remaining before real clinical deployment
- Independent smart contract audit
- Institutional provider/license verification
- Managed secrets/KMS
- Migration version tracking
- Backup and disaster recovery
- Full E2E security testing
- Observability/monitoring
- HIPAA/GDPR/legal compliance
- Clinical security review

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Run `npm run check`
4. Open a pull request

## 📄 License

Add an appropriate license before commercial or clinical deployment.

---

## ⭐ Engineering principle

> **Fast access should not require giving up privacy.**

GoldenHour explores how encryption, patient consent, verified identities and auditable emergency access can work together in a modern healthcare system.
