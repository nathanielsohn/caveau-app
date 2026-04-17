# Investor Demo — Feature Gap List

**Date:** 2026-04-16 (revised after pitch deck skim)
**Author:** Nathaniel Sohn (CTO)
**Purpose:** Inventory of features the app needs so Rob + Samuel can demo the full investor narrative solo.

## What the pitch deck promises

The deck (`Caveau_Pitch_Deck_FINAL.pptx`, 18 slides) organizes the product around three pillars:

1. **Private wine storage** — two-location Naples infrastructure, vault + Fifth Ave showroom
2. **Investment intelligence** — live Liv-ex pricing, exit signals, portfolio performance, critic alerts
3. **AI Advisor** — conversational, institutional-grade, trained on the member's own portfolio

These are the three things that appear as a trio on slides 1, 4, and 5. Pillar 1 is mostly built (facility resilience, Sentinel monitoring, vault structure). Pillar 2 is half-built (Liv-ex pricing yes, exit signals and benchmarking no). **Pillar 3 is completely absent from the app** — there is no AI Advisor surface at all, and it's the single most-hyped capability in the deck (slides 1, 4, 5, 6, 10, 17 all reference it).

The deck also promises a fourth pillar the earlier materials didn't emphasize as strongly: **secure, biometric-verified delivery** (slide 5 "Vault & Secure Delivery", slide 7 full trust/compliance page). This is entirely missing from the app.

## P0 — Demo-blocking. Fix before the next investor conversation.

### 1. AI Advisor Chat

**The single biggest gap.** Slide 6 is a full-page spec. Slide 10 is the scaling argument (one human advisor → 40–50 members today, AI → 5,000 members with 10× better unit economics). The deck explicitly positions this as the differentiator *vs. CellarTracker, Vivino, and InVintory*.

Specific capabilities called out on slide 6 in the member's voice:
- *"What's my best exit opportunity right now?"* → bottle-specific sell window with price momentum
- *"How am I positioned vs the Liv-ex 100?"* → portfolio vs. benchmark YTD
- *"Should I worry about the V-22 humidity alert?"* → Sentinel alert interpretation with cork-integrity reasoning
- *"What would full insurance cost for my collection?"* → rate estimate with partner naming, appraisal brief prep

Needs a chat surface wired to Claude with tool access to the member's portfolio, Liv-ex price history, active sensor alerts, and tier details. Start with the four canonical questions above — those are the ones the deck shows, so they're the ones a sharp investor will try.

### 2. Biometric-verified "Deliver Now" flow

Slide 5 lists it as a core product pillar. Slide 7 spells out the full 4+4 verification ladder (4 app-side, 4 physical handoff):
- App: biometric re-auth → delivery PIN → address confirmation → step-up OTP for >$2K
- Door: ID scan → name match → authorized recipient registry → photo + timestamp log

Florida DABT compliance angle (recipient must be 21+, present, ID-verified). Not in the app. Investors evaluating "luxury, high-trust, high-value asset delivery" will ask how we move a $10K bottle from the vault to a member's home without it becoming a headline — slide 7 is Rob's answer, and it needs to be live, not promised.

Build scope: a "Deliver Now" button on vault-stored bottles → delivery request record → biometric re-auth prompt → PIN → address confirm → (if applicable) OTP → driver handoff UI with ID scan stub and photo log. The driver-side doesn't need a native app; a tokenized web URL works for demo.

### 3. Concierge migration / bulk import from CellarTracker + Vivino

Slides 5, 10, and 17 all pitch this as the churn-killer ("removes the #1 switching barrier: data re-entry"). 48-hour white-glove turnaround is promised on slide 17. Without it, every "how do I get my collection in?" question ends in "we'll build that."

Minimum: CSV import with column mapping (CellarTracker and Vivino both export CSV), plus an admin-facing "migration queue" so staff can fulfill within 48 hours. Not hard. High perceived value.

### 4. Events & tasting module

The deck is the first place this shows up seriously. Slide 14 Y3 revenue mix has **events as the largest single revenue category at $1.224M** — larger than storage subscriptions. Slide 15 breaks it into member events ($450–$1,200/seat, 8–12 events/yr) and corporate/sponsor events. Slide 5 has a "Learn + Events" product tile. Slide 11 ties events to founding-member evangelist network.

Not in the app. The waitlist feature (#49) is done, but events as a first-class concept don't exist.

Minimum: event model (date/location/capacity/price), RSVP flow for members, admin event creation, per-event attendee list, event-scoped signup form for non-members. Seed Naples Winter Wine Festival (Jan 30–Feb 1, 2027) as the first event so Rob can show event→waitlist flow end-to-end.

### 5. Founding Member pricing surface

Slide 11 has specific numbers the app doesn't reflect anywhere:
- Collector $29/mo (no founding discount — flat)
- Reserve list $149/mo → **founding $119/mo**
- Private Vault list $349/mo → **founding $299/mo**
- Estate list $999/mo → **founding $849/mo**

Plus founding benefits listed: 90-day Private Vault trial, Welcome appraisal, Founding Circle status, Day 1 allocation access, price locked for life with continuous membership.

App currently has tier pricing (#44) but (a) the Reserve tier is still "Contact us" in `src/lib/tiers.ts` and needs the $149 number, (b) no founding discount logic, (c) no display of the founding benefits bundle. Onboarding wizard should route founding-window signups through the founding pricing, lock the rate, and surface the benefits.

### 6. Exit signals + exit facilitation (#47)

Two linked features, both pitched on slide 5 as one narrative: *AI flags positions at projected peak with 60–90 day sell window guidance* → member clicks through → handoff package → auction / broker / private sale → commission tracked.

Exit facilitation (#47) is on the roadmap and not built. Exit signals aren't on the roadmap at all — they're adjacent to AI Advisor (#1) but distinct enough to enumerate: a surfaced alert type tied to Liv-ex price momentum + drink-window intersection, visible on the dashboard, the wine detail, and the Advisor.

### 7. Insurance savings estimate

Slide 9 has the specific pitch: *Caveau certified storage + Sentinel monitoring + hurricane evacuation can earn a 20–35% insurer discount*. Slide 9 also adds Berkley One to the PURE/Chubb/AXA XL partner list we had. The Investor Summary math ($300–$790/yr savings on $150K, $1,000–$1,750/yr on $400K) needs to surface somewhere the investor can see. Currently shows nowhere.

Dashboard card or portfolio-view card that takes collection value × tier's documented storage discipline → outputs estimated premium savings range with partner list. Static math is fine; no carrier API required for the demo.

### 8. Member #1 demo state polished

*Revised per your clarification:* Skip the literal 10-bottle audit. The 10-Bottle PDF is a visual-style reference, not a seed spec — the app should carry a diverse, investment-grade-rich portfolio (64 wines currently seeded is the right scale).

What actually needs polish:
- Every seeded wine has a current valuation, a Liv-ex source timestamp, and at least one CAGR projection
- Investment-grade trophies are present across multiple lockers to make the portfolio view interesting
- Tier labels (ANCHOR / ICON / BLUE-CHIP / PRESTIGE / ACCESSIBLE / APPROACHABLE) render correctly per #45
- CCR coverage is broad enough that the Caveau Custody & Condition Report surface isn't empty-looking (currently 11 per SPEC)
- Sentinel history is clean (no simulated-vs-device confusion for demo)
- Rob's bottles specifically demonstrate the pitch: a sold bottle with commission, a scheduled delivery, an active exit signal, an open humidity alert

### 9. Demo talk track

Not a feature — a deliverable Rob asked for explicitly on Apr 16. I'll draft once P0 is shippable. Walking through missing capability is the failure mode; the talk track should be written *after* the product matches the narrative, not before.

## P1 — Claimed in the deck or materials, visibly missing, not demo-blocking but investor-surprising

### 10. Portfolio vs. Liv-ex 100 benchmark

Slide 5 dashboard tile: *"Live value, YTD performance, exit signals and advisor prompts — one view."* Slide 6 Q&A: *"How am I positioned vs the Liv-ex 100?"* The app shows portfolio value and CAGR but not YTD performance vs. an index benchmark. Add a YTD vs. Liv-ex 100 line to the portfolio view.

### 11. Sentinel fleet / device admin

The deck is aggressive about the Sentinel hardware IP — *patent filing in progress*, bottle probe accessory, LTE-M cellular fallback, framed as an acquisition-premium driver on slide 17. Slide 8 bundles specific device counts per tier (Collector requires purchase, Reserve gets 1, Private Vault gets 2, Estate gets 2 + Bottle Probe). There's no device-level surface in the app today — no firmware, battery, WiFi/LTE state, last heartbeat, bundled-vs-purchased status, or assignment to a member/location. Investors who hear "proprietary IoT hardware with patent portfolio" will want to see the device registry.

### 12. Sentinel sensor inventory & tier-bundled assignment

Related to #11 but different surface: at signup, per-tier device allocation needs to be visible. *"Your Private Vault membership includes 2 Sentinels — where do you want them installed?"* With serial number capture, location assignment, activation status.

### 13. Allocation access / limited release queue

Slide 11 founding benefits: *Day 1 allocation access.* Slide 9 value breakdown: *$1,500–$5,000 annual value from allocation access to limited releases & futures.* No feature exists. Minimum: a "Private Allocations" feed where staff can post limited releases with per-tier eligibility, members can request, staff fulfills.

### 14. Welcome appraisal flow

Slide 11 founding benefit. Slide 15 revenue stream (*Appraisal & Estate Docs, $5K–$15K*). Distinct from the Caveau Custody & Condition Report — an appraisal is a point-in-time valuation document for tax/insurance/estate purposes. Needs its own document type (basis, date, appraiser, purpose, heirs if estate-scoped). Extend onboarding to offer a welcome appraisal for founding members.

### 15. Acquisition sourcing workflow

Revenue stream #8, confirmed on slides 12 + 15 (8–12% margin). *Member requests specific bottle → Caveau sources from broker/auction/Caveau private network → margin recorded.* Minimum: request form, admin queue, fulfillment record with margin.

### 16. Insurance referral program (#31)

On the roadmap, pending. Deck adds Berkley One to the PURE/Chubb/AXA XL partner list. Member-facing *"Apply Caveau storage discount with [partner]"* CTA per carrier would satisfy the demo even without carrier API wiring.

### 17. Reserve tier pricing fix

Small one: `src/lib/tiers.ts` Reserve tier is currently `priceDisplay: "Contact us"` and `priceMonthlyUsd: null`. Slide 8 and 12 both confirm Reserve = $149/mo. Update the tier spec and the onboarding flow — Reserve is self-serve per the deck, not sales-quoted.

### 18. Locker check-in / check-out staff workflow (#25)

On the roadmap, not done. NFC intake narrative assumes it exists. LockerActivity audit log + staff-facing intake UI.

### 19. Stripe payments (#27)

Tier metadata in place, billing not. Not strictly demo-blocking — "Stripe wiring is next" is a defensible answer pre-launch — but founding pricing (#5) without actual checkout is thin.

## P2 — Year 2 roadmap items that would strengthen the demo

### 20. Home Cellar Program minimum hooks (#48)

Year 2 per the Home Cellar Program doc. Cheap stub: "home cellar" location type alongside "vault," Sentinel-at-home attachment, certification badge on location. *"X certified Caveau cellars active"* becomes a live metric.

### 21. Mobile push + SMS alerts (#29)

Sentinel spec lists push + email + SMS. App has email. Not demo-blocking but the hardware spec says three channels.

## P3 — Technical debt

### 22. Sensor data pipeline (#22)

Raw retention sweep in place. Partitioning + rollups deferred. Investor scale question answer.

### 23. CSP hardening

Blocked by Next.js inline scripts. Technical-DD concern, not pitch concern.

## Suggested build order — 8–10 weeks solo

1. **Week 1–2 — AI Advisor Chat (#1).** Biggest single gap, centerpiece of the deck. Claude API with portfolio/Liv-ex/alerts tool access. Start with the four canonical questions from slide 6, then generalize. Every investor conversation after this lands differently.
2. **Week 2–3 — Member #1 demo polish (#8) + Reserve pricing fix (#17) + Founding pricing surface (#5).** Fast, high-leverage, fix the "wait, Reserve is $149 not TBD" awkwardness.
3. **Week 3–4 — Exit signals + facilitation (#6).** Revenue stream + Advisor tie-in. Sets up the sell-side narrative.
4. **Week 4–5 — Biometric delivery flow (#2).** Most operationally involved P0. Do it when Advisor momentum exists.
5. **Week 5–6 — Events module (#4).** Seed NWWF. Events is the largest Y3 revenue stream; demo-wise it's also the easiest way to show "traction path" without actual traction.
6. **Week 6–7 — Concierge import (#3) + Insurance savings estimate (#7).** Both are static-math-plus-UI, low effort.
7. **Week 7–8 — Sentinel fleet admin (#11) + sensor inventory (#12) + Portfolio vs. Liv-ex 100 (#10).** Tech-credibility pass.
8. **Week 8+ — P1 remainder: allocation access (#13), welcome appraisal (#14), acquisition sourcing (#15), insurance referrals (#16), staff check-in (#18).**
9. **Week 8–10 — Demo talk track (#9).** Written against the shipped app, not the planned one.

P2 + P3 stay on the roadmap.

## Revised asks for Rob

1. ~~**Pick the real Caveau Certificate name**~~ — **Resolved 2026-04-16 8:20 PM:** Rob locked "Caveau Custody & Condition Report" (CCR) as the final name. Rationale + rollout in [decisions/2026-04-16-ccr-final-rename.md](../decisions/2026-04-16-ccr-final-rename.md). AI Advisor scaffolding should adopt CCR terminology from day one.
2. **Confirm the Reserve tier is self-serve at $149** — `src/lib/tiers.ts` currently says "Contact us" because earlier guidance suggested sales-quoted. Deck says otherwise.
3. **Confirm Berkley One joins PURE / Chubb / AXA XL as a named insurance partner** — Investor Summary listed three, deck lists four.
4. **Who's running intake at launch — Samuel or Rob?** — drives whether the staff check-in flow (#18) is P0 or P1.
5. **Which AI foundation model budget?** — AI Advisor (#1) is the single biggest dependency. Claude (Anthropic) is the natural fit for the "trained on every market move" narrative; pricing is predictable. I'll default to Claude unless you want a different call.
