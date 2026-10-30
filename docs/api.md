# GoldenHour API Reference

All protected routes require an `Authorization: Bearer <token>` header. Bearer tokens expire after 15 minutes. Wallets configured in `ADMIN_WALLETS` are granted administrative oversight, registered and verified healthcare providers hold clinician permissions, and all other authenticated wallets interact as patients. Healthcare provider verification status is verified dynamically on every clinical request.

## Authentication & Authorization Model

1. **Authentication Flow:** Clients request a single-use cryptographic challenge via `GET /api/auth/nonce/:wallet`. The client signs the nonce message using standard EIP-191 personal signing (`eth_sign` / MetaMask). The signature is posted to `POST /api/auth/verify`, which validates the signer on the backend and issues a 15-minute HS256 JWT.
2. **Role Dynamic Evaluation:** Provider status is queried live from the database (`pending`, `verified`, `suspended`). Suspended or pending providers are denied clinical access even if holding an unexpired token.

---

## Complete Route Endpoint Directory

| Method | Endpoint | Authorized Role | Purpose & Description |
|---|---|---|---|
| `GET` | `/health` | Public | Service health and optional blockchain-relay readiness probe. |
| `GET` | `/ready` | Public | Database readiness and schema migration status check. |
| `GET` | `/api/auth/nonce/:wallet` | Public | Issues a single-use 5-minute cryptographic authentication nonce. |
| `POST` | `/api/auth/verify` | Public | Verifies the EIP-191 signature and issues a 15-minute JWT. |
| `GET` | `/api/patients/me` | Authenticated | Resolves the authenticated caller's patient record and ID. |
| `GET` | `/api/patients/:id` | Patient / Admin | Returns patient profile, record metadata, and audit events. |
| `GET` | `/api/patients/all` | Admin | Administrative listing of registered patient records. |
| `POST` | `/api/patients` | Authenticated | Registers emergency profile and critical triage medical data. |
| `PUT` | `/api/patients/:id` | Patient | Updates patient profile and critical triage data. |
| `GET` | `/api/records/:patientId` | Patient / Consented Doctor / Admin | Lists medical record timeline metadata. |
| `GET` | `/api/records/:patientId/:recordId` | Patient / Consented Doctor / Admin | Fetches and decrypts the encrypted clinical record payload. |
| `POST` | `/api/records` | Verified Doctor | Uploads encrypted record with active patient consent. |
| `POST` | `/api/emergency-access` | Verified Doctor | Initiates time-bounded 15-minute emergency break-glass access. |
| `GET` | `/api/emergency-access/critical/:accessId` | Emergency Actor / Admin | Retrieves critical life-saving context during the active 15-minute window (returns 410 when expired). |
| `GET` | `/api/emergency-access/:patientId` | Patient / Admin | Lists emergency audit log events for the specified patient. |
| `GET` | `/api/emergency-access/recent/all` | Admin | Administrative query of recent emergency break-glass sessions. |
| `GET` | `/api/doctors/access` | Authenticated | Returns provider registration and verification status. |
| `POST` | `/api/doctors/register` | Authenticated | Registers a clinician profile for administrative verification. |
| `GET` | `/api/doctors` | Admin | Lists provider profiles (supports optional `?status=pending` filter). |
| `PATCH` | `/api/doctors/:wallet/status` | Admin | Approves (`verified`) or revokes (`suspended`) clinician access. |
| `GET` | `/api/consents/:patientId` | Patient / Admin | Lists active and historical consent grants for a patient. |
| `GET` | `/api/consents/provider` | Verified Doctor | Lists active patient consent grants assigned to the caller. |
| `POST` | `/api/consents/:patientId` | Patient | Grants scoped clinical record access to a verified clinician. |
| `POST` | `/api/consents/:patientId/revoke` | Patient | Revokes previously granted clinician access immediately. |
| `GET` | `/api/compliance/export/:patientId` | Patient | Generates and exports an HL7 FHIR R4 International Patient Summary (IPS) bundle (strictly restricted to the patient). |
| `POST` | `/api/compliance/dsr` | Patient | Records statutory Data Subject Requests (access, correction, grievance) in the patient audit trail. |

---

## Clinical Data Security & Audit Architecture

1. **Storage Tier:** In development, an offline JSON store is supported. In production, PostgreSQL with advisory migration locking and mandatory TLS/CA certificate verification is required.
2. **Off-Chain Encryption:** Sensitive clinical payloads are encrypted off-chain using AES-256-GCM prior to storage. No unencrypted clinical data is ever stored on-chain or on decentralized IPFS gateways.
3. **Emergency Audit Trail:** Every break-glass initiation and critical view event is permanently captured in the patient's audit log, including clinical justification, standardized trauma reason codes, timestamp, and facility identification.
