# GoldenHour Backend

## Production requirements

This service intentionally refuses insecure fallbacks for medical data:

- `JWT_SECRET` must be configured.
- `ENCRYPTION_KEY` must be a base64 encoded 32-byte key.
- `PINATA_JWT` is required before encrypted medical records can be persisted.
- Wallet authentication uses a one-time nonce and signature.
- Emergency access creates an auditable 15-minute critical-only break-glass event.

## Generate an encryption key

`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## Remaining deployment step

The JSON store is suitable for local/demo operation only. A production deployment must replace it with transactional PostgreSQL persistence and migrations.