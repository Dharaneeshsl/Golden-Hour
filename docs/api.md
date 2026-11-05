# GoldenHour API Reference

Single-Hospital Emergency Medical Summary API Specification (v1).

All authenticated endpoints read sessions via secure `HttpOnly` cookies (`gh_access` for 15-minute access, `gh_refresh_token` for 7-day rotating refresh) or `Authorization: Bearer <token>` for legacy compatibility. Clinical write mutations support the `Idempotency-Key` header with automatic replay preservation.

---

## Complete Route Directory

### Authentication & MFA (`/api/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/phone/request` | Public | Initiates a phone OTP login challenge (expires in 5 minutes, 5-send quota). |
| `POST` | `/api/auth/phone/verify` | Public | Verifies the OTP code (5-attempt lockout, replay protected) and issues HttpOnly session cookies or prompts staff MFA. |
| `POST` | `/api/auth/mfa/setup` | Authenticated (MFA Ticket) | Issues an authenticator setup secret and QR code URI for staff MFA enrollment. |
| `POST` | `/api/auth/mfa/complete` | Authenticated (MFA Ticket) | Validates TOTP code / recovery code, completes staff login, and issues emergency recovery codes. |
| `POST` | `/api/auth/refresh` | Public (Refresh Cookie) | Validates and rotates the 7-day refresh token, issuing a fresh access token. |
| `POST` | `/api/auth/logout` | Authenticated | Revokes server-side session and clears client cookies. |

### Patient Operations (`/api/patients`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/patients/me` | Patient | Returns authenticated patient identity, emergency summary, and profile. |
| `POST` | `/api/patients` | Authenticated | Registers new emergency medical summary and critical triage fields (allergies, medications, conditions). |
| `PUT` | `/api/patients/:id` | Patient | Updates emergency summary with optimistic locking (`revision`). |
| `GET` | `/api/patients/:id` | Patient / Clinician / Admin | Retrieves patient summary and timeline (requires consent or admin role). |
| `GET` | `/api/patients/all` | Admin | Administrative listing of registered patients. |
| `POST` | `/api/patients/me/card` | Patient | Issues or rotates the 24-hour emergency offline card token. |

### Clinician & Staff Governance (`/api/doctors`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/doctors/access` | Clinician | Resolves current clinician verification status and permissions. |
| `POST` | `/api/doctors/register` | Authenticated | Registers clinician profile using a valid staff invitation token. |
| `POST` | `/api/doctors/invitations` | Admin | Creates a single-use clinician invitation bound to an authorized phone number. |
| `GET` | `/api/doctors` | Admin | Lists registered staff with optional `?status=pending\|verified\|suspended` filter. |
| `POST` | `/api/doctors/:wallet/verify` | Admin | Approves clinician profile (`verified` status). |
| `PATCH` | `/api/doctors/:wallet/status` | Admin | Suspends or updates clinician access status in real time. |

### Consent Management (`/api/consents`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/consents/:patientId` | Patient / Admin | Lists active and historical consent grants for a patient. |
| `GET` | `/api/consents/provider` | Verified Clinician | Lists patients who have actively granted consent to the calling clinician. |
| `POST` | `/api/consents/:patientId` | Patient | Grants clinical record access to a verified clinician by phone or wallet. |
| `POST` | `/api/consents/:patientId/revoke` | Patient | Immediately revokes clinician access grant. |

### Encrypted Clinical Records (`/api/records`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/records` | Verified Clinician | Envelope-encrypts clinical JSON with AES-256-GCM and persists private object (requires active consent). |
| `GET` | `/api/records/:patientId` | Patient / Consented Clinician | Lists paginated medical record timeline metadata. |
| `GET` | `/api/records/:patientId/:recordId` | Patient / Consented Clinician | Fetches and decrypts private clinical object, validating SHA-256 integrity and patient binding. |

### Emergency Break-Glass & Review (`/api/emergency-access`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/emergency-access` | Verified Clinician | Initiates time-bounded 15-minute break-glass session with mandatory justification and trauma reason code. |
| `GET` | `/api/emergency-access/critical/:accessId` | Emergency Clinician | Fetches critical life-saving triage payload during active 15-minute window (audited on every fetch; returns 410 when expired). |
| `GET` | `/api/emergency-access/:patientId` | Patient / Admin | Lists emergency break-glass audit logs for a patient. |
| `GET` | `/api/emergency-access/recent/all` | Admin | Administrative listing of recent emergency break-glass sessions across all patients. |
| `GET` | `/api/emergency-access/reviews/pending` | Admin / Peer Clinician | Lists break-glass events awaiting mandatory 24-hour clinical review. |
| `POST` | `/api/emergency-access/reviews/:id` | Admin / Peer Clinician | Submits clinical review decision (`approved` or `flagged`) with review notes. |

### Compliance, Export & Erasure (`/api/compliance`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/compliance/me/archive` | Patient | Multi-page bounded archive export with cryptographic cursor pagination and integrity guarantees. |
| `GET` | `/api/compliance/export/:patientId` | Patient | Exports standardized HL7 FHIR R4 International Patient Summary (IPS) bundle. |
| `POST` | `/api/compliance/dsr` | Patient | Submits statutory Data Subject Request (access, correction, grievance, erasure). |
| `GET` | `/api/compliance/me/requests` | Patient | Lists patient's submitted statutory requests and resolution status. |
| `GET` | `/api/compliance/requests` | Admin | Administrative queue of pending data subject requests. |
| `POST` | `/api/compliance/requests/:id/resolve`| Admin | Resolves statutory requests with case reference and audit trail recording. |
| `POST` | `/api/compliance/holds/:patientId` | Admin | Applies or lifts legal/statutory retention hold blocking erasure. |
| `GET` | `/api/compliance/audit-export` | Admin | Verifiable audit segment export in CSV or PDF format with cryptographic hash chain validation and historical identity attribution. |
| `POST` | `/api/compliance/erasure` | Authorized Operator | Triggers clinical erasure protocol (CLI/operator only; returns 503 via standard API). |

### Patient Account Recovery (`/api/recovery`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/recovery` | Authenticated | Submits account recovery request for previous phone/wallet with encrypted proof reference. |
| `GET` | `/api/recovery/mine` | Authenticated | Lists calling user's submitted recovery requests. |
| `GET` | `/api/recovery` | Admin | Lists pending recovery requests awaiting review. |
| `POST` | `/api/recovery/:id/review` | Admin | Reviews recovery request (requires $\ge 2$ independent administrator approvals and verified identity check). |

---

## Health & Operational Endpoints

- `GET /health` — Service health probe.
- `GET /ready` — Database connection and migration status probe.
- `PUT /api/operations` — Admin emergency circuit breaker (allows pausing patient enrollment or emergency break-glass during incident response).
