# GoldenHour engineering delivery

This release targets one hospital per deployment and isolated database. Hosting, environment values, provider accounts and hospital operating decisions belong to the deployment owner.

## Production status

Code work remains open. See [the remaining code backlog](REMAINING_CODE_WORK.md) for transaction, idempotency, disclosure-audit, validation, static-header and key-rotation blockers. The implemented features below do not constitute full production sign-off.

## Implemented code

- [x] Exact expiring wallet challenges shared across replicas with atomic single-use redemption.
- [x] Wallet-bound server sessions, refresh rotation, logout and live session revocation.
- [x] Production staff authenticator MFA with encrypted seeds, shared attempt limits, replay rejection and one-use recovery codes.
- [x] Hospital-issued staff invitations, provider approval and suspension.
- [x] Patient recovery requiring two different administrators, with revocation of prior sessions, cards and grants.
- [x] Private encrypted clinical records, patient-key wrapping, record binding and persistent key registry.
- [x] Vault adapter with startup round-trip check, outage handling, token renewal through a file, and an operator key-rewrap tool.
- [x] Resumable, integrity-checked legacy private-copy migration tool.
- [x] Replaceable hashed QR tokens and explicit clinician identity-match confirmation.
- [x] Time-limited emergency reads, shared emergency quotas and transactional grant/audit/review writes.
- [x] Independent emergency review and administrator incident controls.
- [x] Canonical hash-chained audit records, database immutability trigger and serialized production appends.
- [x] Summary revision conflicts, field source/author/time metadata and explicit unknown values.
- [x] Sensitive-screen expiry and clearing after denied record access.
- [x] Patient-only paginated archive export, patient data requests, hospital resolutions and retention holds.
- [x] Operator clinical erasure with retention checks and an independent append-only ledger.
- [x] Privacy gate that blocks API traffic after restoring a database with unapplied erasure receipts.
- [x] Durable job claims, leases, stale-worker rejection, bounded retries and reconciliation before manual replay.
- [x] Authenticated scheduled maintenance for Vercel and a background-job dashboard.
- [x] Vercel serverless entrypoint, same-origin frontend, warm database reuse and shared PostgreSQL HTTP limits.
- [x] Verified database TLS, environment-based CA support, readiness checks and separate runtime/migration grants.
- [x] Redacted request timing/error logs, administrator queue metrics and graceful container shutdown.
- [x] Locked dependencies, dependency audit checks, secret scan and CI database/browser workflows.
- [x] Browser route splitting for smaller initial downloads.
- [x] Repeatable real-PostgreSQL workflow tests, browser acceptance fixture, local concurrency benchmark and encrypted backup restore.

## Verification evidence

The local verification runs on Node 24 and PostgreSQL 18. CI is configured for PostgreSQL 16 and Chromium.

| Check | Evidence |
| --- | --- |
| Backend unit/API regressions | 39 tests passing |
| PostgreSQL integration | Seven tests covering replica login, MFA, invitations, patient recovery, clinical reads, export, runtime permissions, shared throttles, job leases and erasure replay |
| Frontend regressions | 12 tests passing |
| Browser workflow | Built frontend in Chrome, real PostgreSQL, mobile-size patient view, real wallet signatures from a browser-only signing fixture |
| Backup recovery | Database exported, restored into a second database, synthetic encrypted clinical record decrypted |
| Local concurrency | 25 simultaneous critical reads, zero errors and approximately 200 ms p95, with audit-chain verification |
| Contracts | Six existing contract tests passing |
| Security tooling | Backend and frontend dependency audits report zero known vulnerabilities, secret scan passes |
| Build | Frontend production build passes |

SMS delivery and public chain writes are disabled in the hospital release. The background worker rejects missing handlers and unconfirmed deliveries. Connecting an SMS service requires a tested adapter and the hospital's approved sender/template setup.

The private-copy migration and Vault rewrap tools are operator tools. The private migration now upgrades legacy ciphertext to patient-bound envelopes and passes a repeat-run test. Live migration and rotation against an existing production dataset require deployment-specific verification.

## Deployment-owner release checks

Follow VERCEL_DEPLOYMENT.md and ERASURE_OPERATIONS.md. Supply environment values, create isolated databases and roles, apply every migration, configure managed keys and the independent erasure ledger, and run the synthetic workflow on the deployed hostname.

Record live Vercel routing/TLS results, actual wallet-extension/device results, restore timing, provider behavior, alert routing and rollback evidence. Agree hospital capacity targets and repeat the benchmark on that infrastructure. Obtain independent security findings and clinical workflow acceptance before enrolling live patients. These operating results cannot be inferred from local tests.
