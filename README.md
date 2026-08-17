# GoldenHour

GoldenHour is a privacy-first emergency medical history demo. It models a patient-controlled identity, append-only medical record hashes, verified-provider access, and a break-glass emergency flow. **This repository is a demonstration baseline, not a clinical system, and must not be used with real patient data.**

## Architecture

The Hardhat contracts keep pseudonymous hashes, permissions, and audit events on an Ethereum-compatible network. The Express API provides an integration seam for encrypted off-chain records and IPFS; without `PINATA_JWT`, it deliberately uses a local demo CID. The React/Vite frontend presents patient, clinician, and emergency workflows without requiring a wallet or external credentials for the demo.

## Quick start

```bash
npm run install:all
npm run check
npm run node
# in another terminal
npm run deploy:local
npm run backend
npm run frontend
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/health`.

## Security notes

Raw personally identifiable information is not included in the contracts. Real deployments must use a reviewed key-management strategy, audited contracts, a permissioned provider-verification process, HIPAA/GDPR controls, secure database persistence, and a real IPFS pinning policy. Never commit `.env` files, private keys, or clinical data.

## Project layout

`contracts/` contains five Solidity modules. `test/` contains Hardhat coverage for registration, access, append-only records, and emergency logging. `backend/` contains the API and AES-256-GCM/IPFS integration seam. `frontend/` contains the responsive demo portal. `docs/` contains architecture and API notes.
