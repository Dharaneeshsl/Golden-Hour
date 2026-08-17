# GoldenHour

GoldenHour is a privacy-first emergency medical history demo. It models patient-controlled identity, append-only medical record hashes, verified-provider access, authenticated API sessions, and a break-glass emergency flow. This repository is a demonstration baseline and must not be used with real patient data.

## Current completion level

The implementation is approximately **95–97% complete for the stated demo scope**. The browser UI now uses real routed components, wallet connection through `window.ethereum`, authenticated API requests, persisted local demo state, and an explicit contract integration seam. The remaining gap is production hardening: signed nonce authentication, audited key management, durable production database, permissioned provider verification, deployment observability, and clinical/privacy compliance.

## Quick start

```bash
npm run install:all
cp .env.example .env
npm run check
npm run node
# in another terminal
npm run deploy:local
npm run backend
npm run frontend
```

Open <http://localhost:5173>. The API health endpoint is <http://localhost:4000/health>. The local JSON demo store is written to `.data/goldenhour.json` and is ignored by Git.

## Authentication and roles

`POST /api/auth/login` issues an eight-hour demo JWT for a validated EVM wallet address and one of the `patient`, `doctor`, or `admin` roles. Protected routes require `Authorization: Bearer <token>`. A production deployment must replace this demo login with a signed wallet nonce and server-side replay protection.

## Contract integration

The backend reads `RPC_URL`, `BACKEND_PRIVATE_KEY`, and the five address variables from `.env`. When a backend signer and deployed addresses are present, patient registration, record creation, and emergency access invoke the corresponding ethers contract methods. Without those settings, the API remains runnable in safe `memory/client-wallet` mode and returns an explicit chain status rather than pretending a transaction occurred.

The frontend reads its API and address variables from `frontend/.env.local`; a complete template is provided at `frontend/.env.example`. `WalletConnectButton` requests accounts through MetaMask or another EIP-1193-compatible wallet, while `useContract` exposes the configured registry contract for future signed client-side flows.

## Validation

The standard command is:

```bash
npm run check
```

It compiles and tests the Solidity contracts, runs backend syntax checks and Supertest integration tests, produces a Vite production build, and runs frontend Vitest coverage. The local deployment path is also verified with `npm run node` and `npm run deploy:local`.

## Security boundary

Raw personally identifiable information is not included in the contracts. Real deployments require reviewed key management, audited contracts, a permissioned provider-verification process, HIPAA/GDPR controls, secure database persistence, rate limiting, signed authentication, monitoring, and a real IPFS pinning policy. Never commit `.env` files, private keys, clinical data, or generated build artifacts.

## Project layout

- `contracts/` contains the five Solidity modules.
- `test/` contains contract coverage for registration, access, expiry, revocation, append-only records, and emergency logging.
- `backend/` contains authenticated Express routes, a JSON persistence seam, encryption/IPFS integration, and an ethers chain service.
- `frontend/` contains the routed React/Vite portal, real patient/doctor/emergency components, QR card, API client, and wallet connection.
- `docs/` contains the architecture and API notes.
- `.github/workflows/ci.yml` runs the complete validation command on pushes and pull requests.
