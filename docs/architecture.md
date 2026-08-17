# GoldenHour architecture

```mermaid
flowchart LR
  P[Patient] --> F[React frontend]
  D[Verified doctor] --> F
  F --> B[Express API]
  F --> W[Wallet / QR]
  B --> C[Smart contracts]
  B --> E[AES-256-GCM]
  E --> I[IPFS or permissioned storage]
  C --> A[Immutable audit log]
```

The emergency path exposes only critical fields and requires a justification. A production implementation must bind provider identities to verified organizations and must perform an independent smart-contract and privacy review before handling regulated data.
