# API notes

All routes except `GET /health` and `POST /api/auth/login` require `Authorization: Bearer <jwt>`. The demo JWT is issued for a validated EVM address and one of the `patient`, `doctor`, or `admin` roles.

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Reports API status and whether chain integration is configured. |
| `POST` | `/api/auth/login` | Public | Issues an eight-hour demo JWT from `{ wallet, role, name }`. |
| `POST` | `/api/patients` | Patient/Admin | Registers `{ wallet, profile, critical }`, persists the record, and calls the registry when configured. |
| `GET` | `/api/patients/:id` | Authenticated | Returns the patient profile, record metadata, and audit events. |
| `POST` | `/api/records` | Doctor/Admin | Encrypts `{ clinicalData }`, stores an IPFS/local CID, persists metadata, and calls `MedicalRecord` when configured. |
| `GET` | `/api/records/:patientId` | Authenticated | Lists record metadata for a patient. |
| `POST` | `/api/emergency-access` | Doctor/Admin | Requires `{ patientId, justification }`, triggers the emergency contract when configured, and returns critical fields with an audit event. |
| `GET` | `/api/emergency-access/:patientId` | Authenticated | Lists emergency audit events for a patient. |
| `GET` | `/api/doctors/access` | Authenticated | Describes provider-verification and access capabilities. |

The default local store is JSON-backed at `.data/goldenhour.json`, so demo data survives API restarts. The `DATA_FILE` environment variable can point to another location. Production deployments should replace it with a durable database, use signed wallet nonce authentication, add rate limiting and replay protection, and restrict provider verification through an audited process.

When the blockchain variables and `BACKEND_PRIVATE_KEY` are absent, writes remain available in explicit `memory/client-wallet` mode for local UI development; responses include a `chain.status` value so clients can distinguish demo persistence from a confirmed transaction. When configured, the backend uses ethers to submit registry, record, and emergency transactions and returns the transaction hash and receipt metadata.
