# GoldenHour Backend

## Security baseline
- Wallet nonce/signature authentication.
- Patient ownership checks.
- Provider lifecycle: pending -> verified.
- Audited registration, verification, record and emergency events.
- AES-256-GCM requires a real 32-byte base64 key.
- IPFS persistence refuses fake CIDs.

## Current persistence
The store is intentionally an interface-compatible local implementation. Replace it with PostgreSQL before handling real patient data; JSON files do not provide production concurrency, backup, transaction, retention or HA guarantees.

## Provider governance
Admin verification is a technical workflow only. Real deployments must integrate institutional identity proofing and license verification.