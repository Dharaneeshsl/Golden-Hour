# Vercel deployment

Import this repository with the project root set to the repository root. The checked-in vercel.json installs backend dependencies, builds frontend/dist and sends /api requests to the Node function. Node 24 is selected by the root package manifest. Set framework preset to Other if Vercel asks. The frontend uses same-origin API requests in production.

## Environment values

Set these only in the server environment, never with a VITE_ prefix.

| Variable | Value |
| --- | --- |
| HOSPITAL_NAME | Hospital name recorded on emergency access events |
| CRON_SECRET | At least 32 random characters, used to authenticate the scheduled maintenance route |
| DATABASE_URL | PostgreSQL runtime login through the database provider's connection pooler, without sslmode or certificate query overrides |
| DB_SSL | true |
| DB_CA_PEM | Full PEM certificate supplied by the database provider, with actual line breaks |
| DB_POOL_SIZE | 2 per serverless instance initially, bounded by the provider's connection budget |
| JWT_SECRET | At least 32 cryptographically random characters |
| ENCRYPTION_KEY | 32 cryptographically random bytes encoded in base64, retained for historical records and authenticator secrets |
| KMS_MASTER_KEY | Historical 32-byte wrapping key encoded as 64 hex characters, retained until key migration is verified |
| ADMIN_WALLETS | Comma-separated hospital administrator wallet addresses |
| FRONTEND_ORIGIN | Exact HTTPS origin used by the deployment |
| AUTH_URI | The same HTTPS origin |
| AUTH_DOMAIN | Hostname and optional port from AUTH_URI |
| VAULT_ADDR | Optional HTTPS Vault origin for managed patient-key wrapping |
| VAULT_TRANSIT_KEY | Pre-created Vault transit key name |
| VAULT_TOKEN | Vault application token scoped to encrypt/decrypt operations |

Production staff sign-in requires an authenticator and wallet signature. Enroll initial administrators on a trusted device. Keep the one-use recovery codes and wallet recovery material offline. Recovery codes replace the authenticator factor and still require the wallet signature.

For a new installation, configure Vault before enrolling patients. For historical locally wrapped keys, retain their previous master key during migration. A Vault deployment also needs its own token renewal and recovery process. The optional VAULT_TOKEN_FILE path remains supported for container deployments with an agent-managed token.

## Database preparation

Run migrations once through a trusted operator environment with the migration owner credentials and the same verified TLS configuration. Run `npm ci --prefix backend`, then `node backend/src/config/migrate.js`. Apply deploy/runtime-grants.sql as the owner with psql's runtime_role variable set to the runtime login. Give Vercel the runtime credentials only. Use a direct database connection for migrations if your pooler does not support session advisory locks.

Keep production and preview environments isolated with separate databases, keys and administrator rosters. Each preview needs matching origin settings. Avoid preview deployments connected to live patient data.

## Verify after deployment

Open /api/health and /api/ready, then run the synthetic patient/staff workflow through the deployed hostname. Check staff MFA, consent revocation, record archive download, card replacement, emergency expiry, review and incident controls. Confirm denied responses include no clinical payload. Record the deployment URL, revision, database migration version and findings.

The code does not run migrations during function startup. The readiness check requires the current schema. Database connections are reused within warm function instances. HTTP throttles, emergency quotas, login challenges and MFA attempts persist in PostgreSQL.

The local browser test uses the built frontend and a real PostgreSQL database. It uses a browser-only wallet signing fixture. Actual browser extensions, live Vercel routing, TLS, your database pooler and Vault credentials require a deployment smoke test.

## Reproduce checks

Backend tests use `npm test --prefix backend`. Frontend tests and build use `npm test --prefix frontend` and `npm run build --prefix frontend`. On Windows with Chrome and PostgreSQL installed, run `./backend/integration/local-postgres.ps1 -PostgresBin 'C:/Program Files/PostgreSQL/18/bin' -Browser`.

The integration script uses temporary databases, performs real API and browser workflows, measures 25 concurrent synthetic emergency reads, verifies the audit chain, and restores an encrypted backup into a second database. It cleans up its test cluster. CI repeats the API and browser checks on PostgreSQL 16 with Chromium.

## Invitations and recovery

Administrators create wallet-bound, one-use invitations in Provider Management. A clinician enters the invitation during registration, enrolls an authenticator and awaits hospital verification. Suspended staff lose clinical access.

A patient using a new wallet can submit a hospital identity-verification case reference from onboarding. Two different administrators must approve through Patient recovery. Completion revokes the old wallet's sessions, cards and consent grants. Administrators must carry out the real identity checks through hospital procedure.

## Maintenance and clinical erasure

The deployment includes a daily maintenance schedule. Vercel sends CRON_SECRET as the bearer credential. The endpoint clears expired transient rows in bounded batches and processes a small leased job batch. SMS and chain deliveries remain disabled. Review failed work through Background jobs and reconcile external delivery before retrying.

For clinical erasure, read ERASURE_OPERATIONS.md before enabling CLINICAL_ERASURE_ENABLED. The independent ledger is required on every deployment and restoration after erasure is enabled. Give Vercel a SELECT-only ledger connection in ERASURE_LEDGER_DATABASE_URL. Keep ledger write credentials exclusively in the authorized operator environment.

## Remaining engineering work

Review REMAINING_CODE_WORK.md before treating the release as production-ready. Hosting and environment setup do not close those application-level items.

## Deployment verification

Run the synthetic workflow on the final hostname and record its results. The checked-in tests cover local application behavior. Live Vercel routing, certificate trust, database pooler settings, actual wallet extensions and Vault credentials remain deployment checks.
