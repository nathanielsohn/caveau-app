# Investor Materials → App Proof Points (Batch 2)

> Last updated: 2026-06-27
> Purpose: map Rob’s April 15–16 “batch 2” investor materials to concrete in-app proof points (or a clean “roadmap” answer) so messaging stays unified.

## Materials (received 2026-04-15 unless noted)

| Material | Location in repo | What it’s used for |
|---|---|---|
| Pitch deck (18 slides) | `caveau-docs/investor/Caveau_Pitch_Deck_FINAL.pptx` | Canonical narrative + pillars + pricing |
| Equity / investor summary | `caveau-docs/investor/Caveau_Equity_Investor_Summary_BN.docx` | Anticipated investor Qs + operating plan |
| 10-bottle portfolio PDF | `caveau-docs/investor/Caveau_10_Bottles .pdf` | Demo asset set + valuation storyline |
| Original #48 location-expansion source doc | `caveau-docs/programs/Caveau_Home_Cellar_Program.docx` | Year-2 expansion + Sentinel hardware narrative; the app-facing implementation is now branded as Private Location Monitoring |
| Sentinel hardware render | `caveau-docs/hardware/hardware v1.heic` | Hardware credibility (visual) |
| NFC collar design | `caveau-docs/hardware/Caveau Wine Collar_Final.png` | Bottle-level identity + scan narrative |
| Domain/workspace thread (Apr 16) | `caveau-docs/communications/2026-04-16-domain-workspace-thread.md` | Confirms “feature gap list + talk track” priority |

## Pitch deck slide map (what to show in-app)

### Slide 1 (tagline): “Private Wine Storage · Investment Intelligence · AI Advisor”

- **Private wine storage:** `/locker`, `/sentinel`, `/report/:id`
- **Investment intelligence:** `/portfolio`, `/wine/:id` (valuations), exit signals + exits
- **AI Advisor:** `/advisor`

### Slide 4 (solution pillars): “Private banking for wine”

- Use the **same 3-pillar framing** in the talk track and then immediately click into the matching surfaces.

### Slide 5 (product tiles)

| Deck tile | In-app proof point |
|---|---|
| Portfolio Dashboard | `/` |
| Wine Cellar (scan + import) | `/collection`, `/migrations/new` |
| Exit Intelligence | dashboard exit-signal card + `/wine/:id` + `/exits` |
| Vault & Secure Delivery | `/sentinel` + `/deliveries/:id` + `/handoff-driver/:token` |
| AI Advisor Chat | `/advisor` |
| Learn + Events | `/events` + `/events/[slug]` |

### Slide 6 (AI Advisor canonical questions)

- Run live in `/advisor`:
  - “What’s my best exit opportunity right now?”
  - “How am I positioned vs the Liv-ex 100?”
  - “Should I worry about the latest humidity alert?”
  - “What would full insurance cost for my collection?”

### Slide 7 (Trust & compliance ladder)

- **Member ladder:** `/deliveries/:id` (biometric re-auth → PIN → address → OTP)
- **Driver ladder:** `/handoff-driver/:token` (ID scan stub + name match + authorized recipients + photo log)
- **Talking point:** biometric uses WebAuthn platform authenticator (real Face ID / Touch ID on supported devices).

### Slide 8 + 11 (pricing + founding)

- **Pricing surfaces:** onboarding + `/settings` (Founding bundle + lock messaging)
- **Numbers to keep consistent (deck):**
  - Collector: **$29/mo** (no founding discount)
  - Reserve: **$149/mo** list → **$119/mo** founding
  - Private Vault: **$349/mo** list → **$299/mo** founding
  - Estate: **$999/mo** list → **$849/mo** founding
  - Founding window close: **Jan 1, 2028**

### Slide 12 + 15 (revenue streams)

In-app proof points that match revenue streams:

- Exit facilitation commission workflow: `/exits` + `/admin/exits/*`
- Acquisition sourcing: `/acquisitions` + `/admin/acquisitions/*` (margin tracked admin-side)
- Events: `/events`, public event details, member-only event details after sign-in, and `/admin/events/*`
- Appraisal documents: `/appraisals/*` + `/admin/appraisals/*`
- Hurricane protection: `/settings` + `/admin/hurricane/*`
- Private Location Monitoring: member setup at `/settings/locations`, admin installer/certification workflow at `/admin/installers` and `/admin/facilities/*`, facilities of type `private_location`

### Slide 17 (competitive moat)

- **Physical vault + Sentinel:** `/sentinel`, `/admin/sentinels/*`
- **AI Advisor trained on your data:** `/advisor` (tool-backed answers scoped to member)
- **Concierge migration engine:** `/migrations/new` + `/admin/migrations`
- **Provenance chain:** `/report/:id` + `/verify/:hash` + provenance timeline surfaces
- **Insurance partnership narrative:** insurance partner program (#31) + insurance savings estimate surfaces
- **Event/community network:** `/events` plus public/member-gated event detail pages
- **Certified private location network:** Private Location Monitoring + installer/certification tracking in admin

## Investor summary (docx) → where it shows up

The investor summary is mostly **messaging + ops plan**, not UI. Use it as the source for:

- “Anticipated investor questions” answers in the talk track FAQ section.
- Consistent claims about:
  - Liv-ex API agreement timing (don’t over-claim if not signed yet).
  - Founder traction narrative (“Member #1” + 10-bottle portfolio as demo asset set).

## 10-bottle portfolio PDF → seeded demo dataset

- Portfolio list + valuation story is reflected in seed data and surfaced in:
  - `/collection` (search “Pétrus”, “Screaming Eagle”, etc)
  - `/wine/:id` (valuation history + storage + signals)
  - `/portfolio` (benchmark comparison)

## Original #48 Source Doc → Private Location Monitoring Hooks

- Current shipped hooks:
  - Member-owned private location setup: `/settings/locations`
  - Dedicated private-location view: `/facility` when the active facility is type `private_location`
  - Admin installer registry: `/admin/installers`
  - Admin certification workflow: `/admin/facilities/[id]`
  - Facility support for private locations (type `private_location`) with `ownerMemberId` and `PrivateLocationKind`
- Roadmap/spec items to describe carefully (don’t imply they’re deployed hardware):
  - LTE‑M fallback, bottle probe accessory, and full hardware manufacturing roadmap.

## Known watch-outs (align wording)

- **CCR name:** “Caveau Custody & Condition Report (CCR)” everywhere (avoid “certificate” or older names).
- **Sim vs real:** Sentinel UI includes a demo simulation loop; ingest endpoint + persistence exist, but hardware network claims should be positioned as “Phase 2/3” unless physically deployed.
- **Critic score alerts:** only claim if there is a concrete on-screen surface; otherwise position as roadmap.

## If we do one thing next

Use this map + `docs/APP-INVENTORY.md` to keep `docs/INVESTOR-DEMO-TALK-TRACK.md` tight: every claim should have a click-path or a short, honest “not shipped yet, next on roadmap” answer.
