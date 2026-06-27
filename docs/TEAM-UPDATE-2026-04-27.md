# Team Update — Caveau App Build Sprint (Apr 13 → Apr 27, 2026)

## Copy/paste (Slack)

Heads-down build sprint update (Apr 13 → Apr 27):

- Shipped the full Phase 6 “investor demo gap” set (#50–#62): AI Advisor chat + tools, Deliver Now biometric + driver handoff flow, concierge CSV migration (CellarTracker/Vivino), Events module (Naples Winter Wine Festival seed), Founding Member pricing, exit signals → exit facilitation, insurance savings estimate, portfolio vs Liv-ex 100, Sentinel fleet + tier-bundled device assignment, private allocations, welcome appraisals (PDF + verify), acquisition sourcing (margin tracked).
- Also landed “Rob materials” roadmap items: mobile companion app (#29), insurance partner program (#31), multi-location management (#32), and Private Location Monitoring (#48; originally scoped as a narrower private-residence program).
- Hardened security + operational edges: webhook hardening, safer public verify + image handling, timing-safe bearer comparisons, race-safe admin transitions, CSP tightening, retention sweep for sensor_readings, test coverage on key helpers.
- Business/source materials now live in-repo under `caveau-docs/` (pitch deck + investor summary + original #48 source doc + comms threads) so we can map deck claims ↔ app surfaces.

Next deliverables (so Rob/Sam can demo solo with unified messaging):
- “App Inventory / Demo Map” doc (what exists, where to click, what’s simulated vs real).
- Investor demo talk track (3-min + 10-min versions) aligned to the deck.
- Deck→App mapping checklist (each slide claim has a proof point in-app or a clear “roadmap” answer).

Known remaining gap from the original investor-demo gap list: none in code. Staff locker check-in/out (#25), insurance partner program (#31), mobile companion app (#29), multi-location management (#32), and Private Location Monitoring (#48) are all covered; the next deliverables are the non-code demo/reference materials above.

## What Shipped (high-level)

### Pillar 1 — Private Wine Storage + Trust
- Multi-facility support and facility switching (member + admin).
- Locker program: locker visualization + slot details + occupancy.
- Sentinel monitoring: latest + history endpoints, live sim, alerts, device registry + heartbeats.
- Deliver Now: member ladder + biometric re-auth + PIN/OTP + driver token flow with handoff steps.
- Custody & Condition Reports (CCR): per-bottle report with integrity hash + public verify.
- Hurricane emergency collection protection: member preferences + admin protocol workflow.

### Pillar 2 — Investment Intelligence
- Liv-ex live pricing + valuation history.
- Exit signals (drink-window + momentum) surfaced on dashboard + wine detail + Advisor tool.
- Portfolio view with CAGR + benchmark vs Liv-ex 100 (also exposed to Advisor tool).
- Insurance savings estimate surfaced in dashboard/portfolio + Advisor tool.
- Exit facilitation workflow (consignment) with admin lifecycle + transactional sale close + disposition writes.
- Acquisition sourcing workflow with margin tracked admin-side (member view omits margin).
- Allocation feed (private allocations) with accept/fulfill lifecycle (writes wines with provenance back-links).
- Welcome appraisal PDF workflow + public verify.

### Pillar 3 — AI Advisor
- `/advisor` chat UI + streaming backend.
- Tooling: portfolio, alerts interpretation, exit signals, insurance estimate, allocations/appraisals/acquisitions/exits views.
- Guardrails: member scoping, admin-only fields (e.g. margin/commission) withheld from tools.

## What’s Next (non-code deliverables)

1. App Inventory / Demo Map (canonical “what’s in the app” reference)
2. Investor talk track (unified narrative + click-path)
3. Investor materials map (deck/summary → app proof points + FAQ answers)
