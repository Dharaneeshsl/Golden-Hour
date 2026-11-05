# GoldenHour: earn the first paying hospital customer

The repository describes a reference implementation. Wallet sign-in, QR lookup, consent, timed emergency access, encrypted storage and audit events give us a workflow to demonstrate. They do not establish clinical accuracy, production reliability, legal clearance or willingness to pay. Keep this checklist separate from the engineering scale-up tracker. Check a box only when someone can inspect the evidence.

## 1. This week: find out whether the problem costs anyone enough to buy

- [ ] Founder: pick one city you can visit and three independent hospitals with emergency departments. First buyer hypothesis: the hospital administrator pays; the emergency department lead sponsors; nurses and doctors use it; consenting patients carry the card.
- [ ] Interview five frontline staff, three administrators and five patients or caregivers. Before showing the demo, ask about the last time an emergency summary was missing, how they found it, how long it took, and what already worked. Record anonymous notes, never patient identifiers.
- [ ] Find out who maintains the summary after discharge, who works the night shift, who signs a purchase order and what budget it comes from. Compare with a printed discharge card and the hospital's existing system.
- [ ] Ask one administrator to name a clinical lead, schedule a drill and discuss a written pilot price in rupees. If nobody will commit staff time after three hospital conversations, revisit the buyer or problem before building more.

## 2. Run a drill with fictional patients

- [ ] Clinical lead: agree on the smallest useful summary, who may enter each field, how corrections reach users and when an entry becomes stale. Display source and last review date; distinguish unknown allergies from a recorded absence of allergies.
- [ ] Run 20 paired scenarios against the current workflow on hospital devices. Include a lost card, swapped QR, unconscious patient, expired access, suspended doctor, weak network and a patient without a smartphone. Never delay usual care. Record time to the correct summary, failures and staff assistance for both workflows.
- [ ] Observe wallet setup and recovery. If staff need the founder to log in, fix that before a pilot. Agree success thresholds with the hospital before the drill; any wrong-patient display or unauthorized disclosure stops progression.

## 3. Before any identifiable patient record

- [ ] Founder and Indian privacy counsel: map each field, purpose, recipient, storage location, retention period and deletion route. Document the basis for routine and emergency access separately. Review obligations on the actual launch date: the [official DPDP commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf) sets different dates for different provisions. Obtain a written review of the specific pilot and its claims.
- [ ] Hospital lead: approve clinician credential checks, identity matching, emergency override criteria, review of each override and a manual fallback. Rehearse patient correction, withdrawal and complaints in the languages participants use.
- [ ] Engineering: trace what reaches PostgreSQL, IPFS, chain, logs and backups. Use private storage for pilot records; keep identifiable or linkable data off public networks. Prove deletion and explain backup expiry before making an erasure promise.
- [ ] Engineering: demonstrate hospital isolation, revocation during an active session, expiry, key recovery, restore from backup and outage response using fictional records. Verify production refuses development keys and mock storage. Have an independent reviewer test unauthorized access; resolve serious findings before enrollment.
- [ ] Founder: agree with a local accountant and adviser on the contracting entity, invoicing and tax setup. Sign pilot terms covering scope, price, support hours, incident contacts, responsibilities, exit, export and deletion. Obtain written clinical, privacy and technical sign-off.

## 4. Sell a bounded pilot and decide whether to continue

- [ ] Offer one department a four-week pilot for a capped group of consenting adults. Quote a fixed INR amount after estimating onboarding, hosting, review, training and support. Show the renewal price separately. Count an invoice as revenue only in the appropriate accounts; track cash collected separately. A free trial is not proof of willingness to pay.
- [ ] Train both shifts; name a hospital owner and support contact. Review errors and overrides weekly. Pause immediately for wrong-patient access, unauthorized disclosure or interference with usual care; investigate before restarting.
- [ ] At close, show enrolled patients, actual eligible encounters, successful lookups, time against baseline, incidents, support hours and total cost. Report simulations separately. If there were too few encounters, say the result is inconclusive.
- [ ] Ask the budget owner for a paid renewal at a price that covers delivery. Expand to a second hospital only after the first can operate without the founder and renews. If a printed card performs as well, simplify the product or stop. Do not claim lives saved, government approval or guaranteed instant access on the strength of a demo.
