# Clinical erasure and restore procedure

The erasure tool removes patient clinical data from the active application database. It preserves the minimum pseudonymous audit history and erasure receipt required by the hospital's approved retention policy. Backup expiry, offsite retention and copies held by other systems require that same policy.

## Configure the independent ledger

Create a separate PostgreSQL database with an independent backup lifecycle. Apply deploy/erasure-ledger.sql once as its owner. Create two logins. Give the application login SELECT on erasure_ledger. Give the erasure operator SELECT and INSERT, with no ownership or trigger privileges.

Set CLINICAL_ERASURE_ENABLED=true and ERASURE_LEDGER_DATABASE_URL to the read-only ledger connection on every application deployment. Use verified TLS. The certificate bundle in DB_CA_PEM must trust both database services. The application checks for unapplied receipts at startup and before API requests, and returns a privacy recovery failure until replay is complete.

The authorized operator uses ERASURE_LEDGER_WRITE_URL, the primary migration-owner DATABASE_URL and the same TLS settings. Keep these write credentials out of Vercel and the browser.

## Review and erase

The patient submits an erasure request through Patient data requests. The hospital reviews its clinical retention policy and any holds. Administrators can add or release a hold using a case reference in Patient data requests. The script locks the patient while checking holds, age and deletion, so concurrent clinical inserts cannot bypass the retention decision.

In the operator environment set PATIENT_RETENTION_DAYS to the approved integer retention period, ERASURE_REQUEST_ID to the pending request UUID and ERASURE_APPROVAL_REFERENCE to the approved case reference. Run:

`node backend/scripts/clinical-erasure.js --apply`

The command records an append-only receipt in the separate ledger before deleting active clinical objects, destroying wrapped patient keys, revoking sessions and deleting the patient and related clinical rows. It updates the patient data request and local receipt in the same primary transaction.

If the primary transaction fails after recording intent, API traffic is blocked by the ledger gate until the authorized operator investigates and replays the receipt. Keep the independent ledger available during application recovery.

## Restore without resurrecting erased records

Restore the complete primary database into an isolated environment. Keep its public endpoint closed. Point the operator at the original independent ledger and run:

`node backend/scripts/clinical-erasure.js --apply --replay`

Replay idempotently deletes any restored clinical data covered by the ledger and records the applied receipts. Verify readiness, decrypt a surviving synthetic record and confirm erased patients remain absent before directing traffic to the restored database.

The PostgreSQL tests verify that holds and unelapsed retention block deletion, ledger entries reject deletion, restored patient data triggers a privacy block, and replay removes it. They do not establish the hospital's legal retention period.
