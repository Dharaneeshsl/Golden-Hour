# API notes

All routes except `GET /health` and the nonce/verification authentication endpoints require `Authorization: Bearer <jwt>`. JWTs expire after one hour. Roles are assigned server-side: wallets listed in `ADMIN_WALLETS` are admins, registered providers are doctors, and all other authenticated wallets are patients.

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Reports API status and whether chain integration is configured. |
| `GET` | `/api/auth/nonce/:wallet` | Public | Gets a five-minute wallet-signature challenge. |
| `POST` | `/api/auth/verify` | Public | Verifies the signed challenge and issues a one-hour JWT. |
| `POST` | `/api/patients` | Authenticated | Registers the authenticated wallet's `{ profile, critical }`. |
| `GET` | `/api/patients/me` | Authenticated | Resolves the signed-in wallet's patient identifier. |
| `GET` | `/api/patients/:id` | Authenticated | Returns the patient profile, record metadata, and audit events. |
| `POST` | `/api/records` | Doctor/Admin | Encrypts `{ clinicalData }`, stores an IPFS/local CID, persists metadata, and calls `MedicalRecord` when configured. |
| `GET` | `/api/records/:patientId` | Authenticated | Lists record metadata for a patient. |
| `POST` | `/api/emergency-access` | Doctor/Admin | Requires `{ patientId, justification }`, triggers the emergency contract when configured, and returns critical fields with an audit event. |
| `GET` | `/api/emergency-access/:patientId` | Authenticated | Lists emergency audit events for a patient. |
| `GET` | `/api/doctors/access` | Authenticated | Describes provider-verification and access capabilities. |

The default local store is JSON-backed at `.data/goldenhour.json`, so demo data survives API restarts. The `DATA_FILE` environment variable can point to another location. Production deployments should replace it with a durable database, use signed wallet nonce authentication, add rate limiting and replay protection, and restrict provider verification through an audited process.

The patient registration screen optionally records profile hashes through the patient's connected wallet when `VITE_REGISTRY_ADDRESS` is configured. The backend never signs patient-owned registry transactions. Backend metadata writes remain usable without a chain for local demonstration.
