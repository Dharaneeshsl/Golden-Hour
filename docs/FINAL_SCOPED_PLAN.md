# GoldenHour: Final Scoped Technical Plan (Prototype → First Paying Hospital → Product)

Date: 5 Nov 2026. Based on the repository snapshot you shared. Time estimates assume 1–2 engineers; adjust if you have more.

## 0. Where you actually are

**Strong already (keep):** wallet-signed sessions, staff MFA, per-patient envelope encryption with Vault Transit support, hash-chained audit log with DB immutability trigger, break-glass with review queue, replaceable QR cards, idempotent writes (clinicalWriteGuard), erasure ledger + restore gate, runtime/migration DB role split, real-PostgreSQL and browser tests, backup restore drill.

**The five things that decide whether this becomes a startup:**
1. **Wallet login (MetaMask) is the biggest adoption blocker.** Nurses, ER doctors and patients in Indian hospitals will not install a crypto wallet. Your own schema already has `users` / `identities` (migration 004) but nothing uses them.
2. **Blockchain adds cost and risk with no buyer value.** It is already disabled in production. Remove it from the product scope.
3. **Hosting is Vercel + external Postgres.** Health data for Indian patients should be hosted in India, with logs retained under CERT-In rules.
4. **No proof anyone will pay.** `INDIA_STARTUP_TODO.md` is right: nothing below matters until a hospital commits staff time.
5. **Docs are partly stale.** `REMAINING_CODE_WORK.md` lists items (read-audit, SQL pagination, transactional writes via the guard) that the code now appears to implement. Re-verify each item with a test before trusting any "done / open" list.

## 1. Final MVP scope (frozen)

**IN (v1 = "Emergency Summary for one hospital's ED"):**
- Patient: sign in with phone OTP (later ABHA), create emergency summary (blood group, allergies, conditions, medications, emergency contact), issue / replace QR card, see who accessed, revoke, download data, raise data requests.
- Doctor/nurse: hospital-invited account, authenticator/WebAuthn, scan QR or search → break-glass with reason → 15-min critical view.
- Hospital admin: invite/suspend staff, review break-glass queue, retention holds, incident pause, audit export.
- Consent-based record viewing and clinician-added encrypted records.
- Languages: English + Tamil + Hindi across the whole UI (today only emergency strings exist).
- Installable mobile web app (PWA) for patients; fast, low-bandwidth ER screen.

**OUT of v1 (do not build yet):** smart contracts / on-chain anchoring, public IPFS, SMS to relatives, billing automation, ABDM live production integration, insurer features, AI features, native apps, multi-hospital shared network.

## 2. Phase 0: Validate and decide (Weeks 0–3, mostly non-code)

- [ ] Run the interviews and 20-scenario drill in `INDIA_STARTUP_TODO.md` §1–2. Gate: one hospital names a clinical lead and agrees to a written paid pilot discussion.
- [ ] **Decision A, emergency access model.** Pick one and test it in the drill: (a) clinician login required (current), (b) patient-opted minimal public card (blood group + life-threatening allergies only, no login), (c) both. Target: scan → correct data in under 30 seconds on a hospital phone.
- [ ] **Decision B, tenancy.** Single-tenant deployment per hospital (current, simpler isolation, higher ops cost) vs multi-tenant with `org_id` (migration 004 has `organizations`/`memberships` as schema only). Recommendation: first 1–3 hospitals single-tenant on the same IaC template; move to multi-tenant only after hospital #3.
- [ ] **Decision C, cloud.** Recommendation: AWS ap-south-1 (Mumbai) or Azure Central India. See §4.
- [ ] Book a regulatory opinion: DPDP applicability for the pilot, and whether a patient-reported emergency summary viewer is Software as a Medical Device under CDSCO rules (get it in writing; do not assume).
- [ ] Appoint a clinical advisor (ED physician) who signs off the data fields and the break-glass wording.

## 3. Phase 1: Product hardening MVP (Weeks 3–13)

### 3.1 Authentication rebuild (highest priority, ~3–4 weeks)
- [ ] Patient login: phone OTP via an India SMS provider (DLT-registered sender and templates) with rate limits, OTP expiry, and lockout. Use the existing `users` / `identities` tables; keep wallet as an optional linked identity.
- [ ] Staff login: hospital-invited email/phone + WebAuthn passkey (or TOTP, which you already have). Remove wallet signature from the staff path.
- [ ] Replace the `login.jsx` "Sign Message with MetaMask" flow, `WalletConnectButton`, `session.js` wallet-revoke logic, SIWE nonce routes (or keep behind a feature flag).
- [ ] Session design: short access token + rotating refresh cookie (already built); move the token out of `localStorage` into an HttpOnly cookie to reduce XSS exposure.
- [ ] Account recovery for patients without a wallet: phone re-verification + hospital identity check (adapt the existing two-admin recovery flow).
- [ ] Migrate wallet identifiers in `patients`/`providers`/`audit` to stable `user_id` while keeping history intact. Write and rehearse the migration on a restored copy.
- **Exit:** a nurse who has never seen a wallet can sign in and open a synthetic card in under 30 seconds on first try.

### 3.2 Close the genuine engineering blockers (~2 weeks)
- [ ] Re-audit every item in `REMAINING_CODE_WORK.md` with a failing-then-passing test; delete the ones already fixed.
- [ ] Failure-injection tests: audit write fails → clinical change rolled back; lost response after commit → same idempotency key returns original result; concurrent same-key requests.
- [ ] Security headers for the static frontend (CSP, frame-ancestors, referrer policy, HSTS, permissions policy). `vercel.json` has no `headers`; in the new hosting setup define them at the gateway (Caddy/CloudFront) and test.
- [ ] Versioned key rotation for `ENCRYPTION_KEY` (legacy records and MFA seeds) with interrupted-rotation and mixed-version tests.
- [ ] Remove `JsonStore`, the local IPFS mock, and `ALLOW_INSECURE_LOCAL_STORE` from production code paths; tests use real Postgres only.
- [ ] Remove blockchain: `contracts/`, `hardhat.config.js`, `chainService`, `scripts/deploy*.js`, `useContract.js`, chain env vars, and related CI. Keep the audit hash chain.
- [ ] Erasure tests covering encrypted objects, wrapped keys, justifications and all related rows.
- [ ] Replace placeholder `docs/` claims with one accurate `STATUS.md` (counts of tests, known gaps) generated from CI output.

### 3.3 Hosting migration to India (~2 weeks)
- [ ] Containerize (Dockerfiles exist): backend + frontend behind a gateway on ECS/Fargate or a small Kubernetes/VM setup in Mumbai.
- [ ] Managed PostgreSQL in the same region, private networking, verified TLS, PITR backups, encrypted snapshots, cross-AZ.
- [ ] Key custody: AWS KMS (or keep Vault) for wrapping patient keys; separate roles for app (encrypt/decrypt) and operator (rewrap).
- [ ] Infrastructure as code (Terraform) so each hospital environment is reproducible.
- [ ] Replace Vercel cron with a proper worker process for the outbox/cleanup jobs.
- [ ] Logs: structured, PHI-free, shipped to a store with 180-day retention (CERT-In expectation; confirm with counsel).
- [ ] Staging and production fully isolated (separate DBs, keys, admin rosters).

### 3.4 Product features required for a pilot (~4 weeks, parallel)
- [ ] Full i18n (English/Tamil/Hindi), including legal notices and error messages; clinician-reviewed translations.
- [ ] Patient PWA: installable, offline-tolerant card view, large-text/accessibility pass (WCAG AA).
- [ ] Doctor flow polish: scan via camera, patient search by card/ID, recent patients, clear "unknown vs none recorded" display (provenance already stored).
- [ ] Admin: staff roster import (CSV), suspend/offboard, break-glass review SLA indicators, audit export (CSV/PDF) with hash-chain verification report.
- [ ] Summary freshness: "last reviewed" prompts to patients, stale-data warnings in the ER view.
- [ ] Optional: file attachments (table `files` exists as schema only) with malware scanning, size limits and encrypted storage. Defer unless the pilot hospital requires it.
- [ ] In-app support and incident contact, status page, and a clear "follow usual care" fallback banner (partly built).

## 4. Phase 2: Pilot readiness (Weeks 13–20)

### Security and reliability
- [ ] Independent penetration test (web/API, authN/Z, tenant isolation, crypto usage). Fix all high/critical; retest.
- [ ] Threat model document (STRIDE) for card theft, insider snooping, break-glass abuse, SIM-swap on OTP, replay.
- [ ] Load test on target infra: define hospital capacity (e.g., 50 concurrent ED users) and measure p95 for scan → data.
- [ ] Observability: metrics, alerts (error rate, auth failures, break-glass spikes, queue backlog, DB connections), on-call rota and runbooks.
- [ ] Disaster recovery: documented RPO/RTO, timed restore drill on production-like data, rollback of a bad migration drill, key-loss scenario drill.
- [ ] Dependency, container and secret scanning in CI; SBOM; signed images; branch protection.
- [ ] Device matrix test: low-end Android, hospital desktops, flaky Wi-Fi.

### Compliance and governance
- [ ] DPIA and data-flow map (fields → purpose → recipients → storage → retention → deletion).
- [ ] DPDP: consent notices, purpose limitation, withdrawal and grievance flows, breach-notification runbook, Data Protection Officer or contact assigned, vendor/processor agreements. Confirm obligation dates with counsel (DPDP Rules phase in over 2026–2027).
- [ ] CERT-In incident reporting procedure (6-hour window) and tabletop exercise.
- [ ] Hospital contract pack: pilot terms, data processing agreement, SLA, support hours, exit/export/deletion.
- [ ] Clinical safety case: hazard log (wrong patient, stale allergy, false reassurance), mitigations, sign-off by clinical advisor.

## 5. Phase 3: Paid pilot (Months 5–7)

- [ ] One department, 4-week pilot, capped group of consenting adults, fixed INR price, renewal price shown separately.
- [ ] Train both shifts; weekly review of overrides and incidents; stop rules for wrong-patient display or unauthorized disclosure.
- [ ] Metrics: enrollments, eligible encounters, successful lookups, time to correct summary vs baseline, break-glass volume and review outcomes, support hours, cost per patient. Report simulations separately; say "inconclusive" if volumes are too low.
- [ ] Convert to paid renewal. Do not claim lives saved, ABDM approval or guaranteed instant access.

## 6. Phase 4: Scale (Months 7–12, only after a paid renewal)

- [ ] ABDM: register in sandbox, ABHA login/linking, HIP/HIU flows, FHIR bundles (your `fhirService` is a starting point), milestone certification.
- [ ] HIS/EHR integration (HL7 FHIR / vendor APIs) so summaries are not only patient-entered; clinician-verified fields with provenance.
- [ ] Multi-tenant platform: `organizations`/`memberships`, per-org RBAC, per-org keys, admin console.
- [ ] Billing and plan management, usage reporting.
- [ ] Optional: SMS/WhatsApp alerts to emergency contacts (adapter, signed delivery callbacks, idempotency), native apps, ambulance/EMT role.
- [ ] SOC 2 / ISO 27001 readiness if selling to larger chains.

## 7. Definition of done for "launchable to real users"

A release is launchable only when all are true and evidenced in the repo/CI or release record:
1. No wallet needed for any user type; first-time nurse and patient usability test passed.
2. Hosted in India with tested backup restore and measured RTO/RPO.
3. All Phase 1 blockers closed with automated tests; CI green on real Postgres + browser tests.
4. Pen test report with no open high/critical findings.
5. DPIA, DPA, grievance process and breach runbook signed off by counsel.
6. Clinical safety case signed by the hospital's clinical lead.
7. Signed paid pilot agreement and named hospital owner.

## 8. Suggested order of work (critical path)

Weeks 0–3 validation and decisions → 3–7 auth rebuild + remove blockchain → 5–9 India hosting + IaC (parallel) → 7–11 blockers, i18n, PWA → 11–13 admin/doctor polish → 13–17 pen test, DR drills, load test → 17–20 compliance pack and pilot contract → pilot.

## 9. Rough budget (estimates, verify with real quotes)

Cloud (small prod + staging, India region): roughly ₹25–60k/month. SMS/OTP: usage based. Pen test: ₹1.5–5 lakh. Legal/privacy counsel: ₹1–3 lakh for the pilot pack. Contingency: 20%.

## 10. Biggest risks and mitigations

- **Hospitals won't commit:** keep Phase 0 gate strict; don't build past Phase 1 without a named clinical lead.
- **Stale or wrong patient-entered data:** provenance, review dates, clear "patient reported" labels; push toward clinician-verified fields via HIS integration.
- **Break-glass abuse:** per-user quotas, mandatory review SLA, alerts, patient-visible history.
- **Regulatory classification surprise:** written opinion before pilot.
- **Solo-founder ops load:** IaC, runbooks, alerts, and a strictly bounded pilot scope.