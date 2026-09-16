# API notes

All routes except `GET /health` and nonce/verification endpoints require a bearer JWT. JWTs expire after one hour. Wallets in `ADMIN_WALLETS` are admins, registered providers are doctors, and other authenticated wallets are patients. Provider status is checked live for clinical authorization.

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | API and chain-relay status. |
| `GET` | `/api/auth/nonce/:wallet` | Public | Five-minute wallet-signature challenge. |
| `POST` | `/api/auth/verify` | Public | Verifies the signed challenge and issues a JWT. |
| `POST` | `/api/patients` | Authenticated | Registers the wallet's profile and critical data; synchronizes `PatientRegistry` when chain relay is configured. |
| `GET` | `/api/patients/me` | Authenticated | Resolves the signed-in wallet's patient identifier. |
| `GET` | `/api/patients/:id` | Patient/Admin | Returns patient profile, record metadata, and audit events. |
| `POST` | `/api/records` | Verified Doctor | Requires active consent, encrypts clinical data, stores it on IPFS, persists metadata, and synchronizes `MedicalRecord` when configured. |
| `GET` | `/api/records/:patientId` | Patient / Consented Doctor / Admin | Lists record metadata. |
| `GET` | `/api/records/:patientId/:recordId` | Patient / Consented Doctor / Admin | Fetches and decrypts the encrypted clinical payload after authorization. |
| `POST` | `/api/emergency-access` | Verified Doctor | Creates a 15-minute break-glass grant and synchronizes the emergency event on-chain when configured. |
| `GET` | `/api/emergency-access/critical/:accessId` | Emergency Actor / Admin | Returns critical-only data while the 15-minute grant is valid; expired access returns `410`. |
| `GET` | `/api/emergency-access/:patientId` | Patient / Admin | Lists emergency audit events. |
| `GET` | `/api/doctors/access` | Authenticated | Returns provider status and permissions. |
| `GET` | `/api/doctors?status=pending` | Admin | Lists providers awaiting verification. |
| `POST` | `/api/doctors/:wallet/verify` | Admin | Verifies a provider and synchronizes on-chain provider status when configured. |

## Consent

Patients grant/revoke consent through the consent endpoints. Administrators have read-only oversight through `GET /api/consents/:patientId`. Consent responses include `providerWallet`, `providerName`, and `providerSpecialty`, so clients can revoke using the real provider wallet. When chain relay integration is configured, grant/revoke is synchronized to `AccessControl`.

## Storage and encryption

The default local store is `.data/goldenhour.json`; `DATA_FILE` can override it. Production deployments should use a durable database and secure key management. Clinical data uses AES-256-GCM before IPFS persistence. The record-detail endpoint decrypts only after patient, consented verified-provider, or admin authorization.

## Chain integration

Chain integration is implemented as a trusted backend relay. `PatientRegistry`, `AccessControl`, `MedicalRecord`, and `EmergencyAccess` expose explicit relay operations while retaining direct wallet operations. Deploy with the updated `scripts/deploy.js` and configure `RPC_URL`, `BACKEND_PRIVATE_KEY`, `REGISTRY_ADDRESS`, `ACCESS_CONTROL_ADDRESS`, `RECORDS_ADDRESS`, `AUDIT_ADDRESS`, and `EMERGENCY_ADDRESS`. The backend signer must have the required contract permissions. Without this configuration, the API intentionally remains usable in local/off-chain mode.

The frontend `useContract` helper remains available for direct wallet interaction, but patient registration is coordinated through the authenticated API flow so the backend can keep database and chain state aligned. After provider verification, an already-issued JWT retains its original role claim until it expires or the user signs in again; live provider-status checks still govern clinical access.
