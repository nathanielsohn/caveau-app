# Investor Demo Talk Track (App-First)

> Last updated: 2026-04-27
> Goal: a consistent walkthrough Rob/Sam can run solo that matches the pitch deck pillars: **Private Wine Storage · Investment Intelligence · AI Advisor**.

## 0) Prep checklist (before the meeting)

- Use a device that supports **platform biometrics** for Deliver Now (Mac Touch ID or iPhone/iPad Face ID via WebAuthn).
- Ensure env is configured for “wow” moments:
  - `ANTHROPIC_API_KEY` (AI Advisor)
  - `LIVEX_API_KEY` (live pricing; demo still works without it using seeded valuations)
  - `AWS_S3_BUCKET` (optional — image upload)
  - `GOOGLE_CLOUD_VISION_API_KEY` (optional — label scan)
- Demo login: `robert@caveau.com` / `demo1234` (enable `NEXT_PUBLIC_SHOW_DEMO_CREDS=true` if you want it shown on-screen).

## 1) The 10-minute version (recommended)

### 0:00–0:30 — Opener (say this verbatim)

“Caveau is **private banking for wine**: we combine **physical vault storage**, **investment-grade intelligence**, and an **AI Advisor** that understands your portfolio live — so collectors can *collect with confidence*.”

### 0:30–2:30 — Pillar 1: Private Wine Storage (prove custody + monitoring)

1) **Dashboard** (`/`)
- Line: “This is the member’s command center — value + conditions + alerts + next-best actions in one view.”
- Point at: collection value, alerts summary, exit signals teaser.

2) **Locker** (`/locker`)
- Line: “We treat the cellar like a vault — every bottle has a physical slot and a custody story.”
- Click: any occupied slot → show bottle details.

3) **Sentinel** (`/sentinel`)
- Line: “Sentinel ties the physical environment to the asset — live conditions, historical charts, and thresholded alerts.”
- Point at: temp/humidity bands + alert list.

4) **Custody & Condition Report (CCR)** (`/report/:id` then `/verify/:hash`)
- Line: “This is the Carfax for wine — custody + conditions + integrity proof you can verify publicly.”
- Action: open verify page to show public validation flow (no login).

### 2:30–5:00 — Pillar 2: Investment Intelligence (prove pricing + timing + exits)

5) **Wine detail** (`/wine/:id`)
- Line: “Every bottle has live valuation history and clear actions: hold, deliver, or exit.”
- Point at: valuation chart + exit signal panel (if present) + storage location.

6) **Portfolio vs Liv-ex 100** (`/portfolio`)
- Line: “This is an investor-grade view: portfolio performance vs a benchmark — not just inventory.”
- Point at: indexed series + delta vs Liv-ex.

7) **Exit facilitation** (`/exits` or `/exits/new?wineId=...`)
- Line: “When we say ‘exit intelligence’, it ends in an operational workflow: consignment request → listing channel → sale close that writes disposition + closes the signal.”
- Optional: if time, show the member list and one detail record.

### 5:00–7:30 — Pillar 3: AI Advisor (prove slide-6 questions)

8) **AI Advisor chat** (`/advisor`)
- Line: “This isn’t a static chatbot — it has tools wired to the member’s portfolio, alerts, and pricing.”
- Ask the four deck questions (copy/paste works):
  1. “What’s my best exit opportunity right now?”
  2. “How am I positioned vs the Liv-ex 100?”
  3. “Should I worry about the latest humidity alert?”
  4. “What would full insurance cost for my collection?”
- Point at: tool pills / structured answers (not generic links).

### 7:30–9:15 — Switching friction + community revenue (pick 1–2)

Pick based on the investor’s questions:

- **Concierge migration** (`/migrations/new`)
  - Line: “We remove the #1 switching barrier — import from CellarTracker/Vivino and staff fulfills within 48 hours.”
- **Events** (`/events` → `/events/[slug]`)
  - Line: “Events are a core revenue stream and the network effect — members RSVP, non-members become leads.”

### 9:15–10:00 — Close (founding urgency + next step)

9) **Founding Member pricing / benefits** (`/settings` or `/waitlist`)
- Line: “Founding locks pricing for life, drives urgency, and seeds the evangelist network.”
- Close ask: “If this direction resonates, we’re raising a $1.5–$2.2M seed to finish buildout + Sentinel R&D and execute Naples launch.”

## 2) The 3-minute version (when time is tight)

1) **Dashboard** (`/`) — “one screen ties custody + value + next actions.”
2) **AI Advisor** (`/advisor`) — ask:
   - “What’s my best exit opportunity right now?”
   - “How am I positioned vs the Liv-ex 100?”
3) **Sentinel** (`/sentinel`) — show live monitoring bands + alerts.
4) **Verify** (`/verify/:hash`) — “public integrity proof.”

## 3) Guardrails (avoid unforced errors)

- If **AI Advisor** is not configured, say: “Advisor is live behind our API key; the UI degrades gracefully in environments without it.”
- If **Liv-ex** isn’t configured, say: “Pricing history is seeded for demo; live sync runs once the commercial API agreement is active.”
- Don’t claim “critic score alerts” unless you can point to a concrete surface (keep as roadmap unless confirmed).
- For anything hardware-specific (LTE‑M fallback, bottle probe), position as **roadmap/spec** unless you’re showing it in `/admin/sentinels` as a seeded device model.

## 4) FAQ quick answers (1-liners)

- **“Why Naples?”** Greenfield for pro storage, extreme HNW concentration, and seasonal residency concentrates collections.
- **“Why hasn’t this been built?”** Legacy operators are storage/retail; the AI + live data + workflow layer is newly feasible at cost.
- **“What’s hard to copy?”** Physical vault + compounding custody data + migration engine + partner relationships + network effects.
- **“How does it scale?”** AI handles the majority of portfolio Q&A, letting a small team serve orders of magnitude more members.

## 5) Reference docs

- App inventory / demo map: `docs/APP-INVENTORY.md`
- Phase 6 gap list (historical, deck-referenced): `docs/PHASE-6-INVESTOR-DEMO-GAP.md`
- Business materials index: `caveau-docs/INDEX.md`
