# Hospital deployment and release evidence

GoldenHour supports a single-hospital workflow for patient-issued QR cards and time-limited clinician access. Use fictional patients in staging. A separate hostname, private database, keys and staff roster per hospital are part of this deployment design.

## What a hospital can evaluate today

A patient signs in, enrolls, issues a printable card and grants a verified clinician access. The clinician can create and retrieve an encrypted record. Issuing a replacement invalidates the previous token. A verified clinician supplies a reason to open emergency access. Each read checks the access window and clinician status. An administrator can approve or flag the event in the review queue. Emergency SMS is disabled. Clinical summaries identify patient-reported information.

## Stage the build

1. Provision an isolated PostgreSQL database, DNS and ports 80/443 for the gateway. Create a migration owner and a separate runtime login with no ownership, DDL or elevated role membership. Restrict network access to the application host.
2. Inject PUBLIC_HOST, DATABASE_URL, MIGRATION_DATABASE_URL, DB_CA (PEM file path), ADMIN_WALLETS, JWT_SECRET (at least 32 random characters), KMS_MASTER_KEY (64 random hex characters) and ENCRYPTION_KEY (32 random bytes encoded in base64). Keep secrets and key backups outside Git. The wrapping key currently lives in the application environment.
3. Run `docker compose config --quiet`, then `docker compose run --rm migrate`. As migration owner, use psql to apply [runtime grants](../deploy/runtime-grants.sql) with the runtime_role variable set to the runtime login. Run `docker compose up --build -d`. The Caddy gateway handles HTTPS for the configured hostname. Only the gateway exposes host ports.
4. Verify the internal /ready route, then use a second device over HTTPS to sign in and scan a synthetic card. Check that a revoked card fails, an expired session clears the screen and a suspended clinician loses access. Retain the image digests and redacted results.
5. Use a fresh staging database for initial evaluation. Existing public IPFS records require a verified private copy before switching the deployment. The operator can run `node backend/scripts/migrate-private-records.js` with migration credentials after supplying legacy storage access. It checks ciphertext integrity and updates each pointer transactionally, so retries skip completed copies. The script has been syntax checked. Verify it against a restored legacy dataset before using it on live data. Earlier plaintext audit entries, QR URLs and backups need inventory and remediation. This migration invalidates older login sessions. Test upgrades on an isolated copy first.

## Reproduce the API verification

From backend, install locked dependencies and run `npm test`. On Windows, run `./integration/local-postgres.ps1 -PostgresBin 'C:/Program Files/PostgreSQL/18/bin'`. The script starts and stops a disposable PostgreSQL instance on loopback port 55439. On CI, PostgreSQL 16 runs migrations and `node --test integration/postgres-login.js`. Supply only a disposable database to those integration tests.

The real-database drill covers concurrent challenge redemption, wrong-domain text, expired challenges, independent staff verification, stale edit conflicts, card replacement, private clinical record encryption and retrieval, timed access and independent review. The test connects over loopback and directly invokes the HTTP app. DNS, deployment TLS, hospital devices and network latency need a separate staging drill.

## Live-use decision

Keep the [production engineering checklist](PRODUCTION_ENGINEERING_TODO.md) open until the release record includes operating evidence. Remaining work includes managed key custody and rotation, legacy data migration, live identity-verification procedures, production restore timing, hospital-device and capacity tests, production alert routing, restore and rollback drills, independent security testing, and hospital clinical acceptance. Record owners, findings, remediation and retest dates. Clinical approval, paying customers and uptime history require evidence from the operating business.


## Managed key service and incident response

Vault Transit support wraps patient keys through the encrypt/decrypt API. Configure VAULT_ADDR with an HTTPS origin, VAULT_TRANSIT_KEY with a pre-created transit key and VAULT_TOKEN_DIR with a host directory containing a token file named token. Compose mounts the directory read-only. A Vault Agent can renew the token. Grant the application encrypt/decrypt permissions only. Use a separate operator token for rewrap and key administration. The adapter follows the [official Transit API](https://developer.hashicorp.com/vault/api-docs/secret/transit).

For an existing database, keep the historical KMS_MASTER_KEY available, back up keys and the database, and run `node backend/scripts/rewrap-patient-keys.js` against a restored staging copy. It rewraps Vault ciphertext or migrates historical wrapped keys. Concurrent shredding or updates prevent its compare-and-update write. Verify records before retiring old versions. Adapter request tests and an injected key-service outage test pass. Live Vault authorization, renewal, rotation and recovery require deployment credentials and staging verification.

Administrators can pause enrollment and emergency access in Incident controls. Changes persist in PostgreSQL and append an audit event in the same transaction. Pausing emergency access blocks further API reads and new grants across replicas. Notify clinicians to follow hospital procedure. Sensitive data already displayed on a device cannot be remotely recalled.

The local PostgreSQL drill now exports a database backup, restores it into a second database and decrypts a synthetic clinical record there. This demonstrates the restore procedure on local PostgreSQL 18. Production backup retention, offsite storage, encryption and measured recovery time still require an operating deployment.

## Offline QR and support configuration

The frontend build produces manifest.webmanifest, PNG/SVG icons and a versioned service worker. It caches only a build-time allowlist of public assets; API responses are never added to that cache. Patients can explicitly save their newly issued QR credential on a private device for 24 hours and open /offline. No clinical summary is persisted for offline use. Expiry and sign-out remove the saved credential. Replacement/revocation is enforced online by the clinician API; a saved offline copy is not proof that a card is still valid.

The gateway must serve /sw.js and SPA routes from the same HTTPS origin as the API. Do not add a CDN rule that caches /api responses. VITE_SUPPORT_EMAIL can be supplied at frontend build time; if omitted, the support screen directs users to the hospital desk/privacy contact. The status screen performs a liveness check and does not promise complete service availability.

Run node scripts/pwa-browser.cjs from the repository root after the frontend build. This uses synthetic data on a local static server, checks service-worker isolation, expiry, camera QR decoding and logout cleanup, and sends no SMS.
