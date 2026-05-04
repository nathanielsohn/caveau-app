# App Inventory / Demo Map

> Last updated: 2026-04-27
> Goal: a single “what exists + where to click” reference so we can write a consistent investor talk track and avoid mis-speaking about what’s real vs simulated.

## Who this is for

- **Rob + Samuel:** run a product demo solo, confidently.
- **Anyone on the team:** quickly orient to what’s in the app and how the pieces connect.

## Roles (what access changes)

- **Public (no auth):** `/verify/*`, `/bottle/*`, `/handoff/*`, `/handoff-driver/*`, `/waitlist`, `/events` and public event detail pages. Member-only event details redirect to login before rendering private metadata.
- **Member:** full product surfaces (dashboard, collection, locker, Sentinel, Advisor, etc). All data scoped to `session.user.id`.
- **Admin:** `/admin/*` surfaces + destructive workflows (hurricane protocol authoring/advancement, fulfillment queues, etc).

## Demo account + seeded narrative

- Demo credentials: `robert@caveau.com` / `demo1234` (shown on login only when `NEXT_PUBLIC_SHOW_DEMO_CREDS=true`).
- Seed includes:
  - Robert as **Member #1** with an investment-grade set (10-bottle portfolio) plus broader inventory.
  - **Naples Winter Wine Festival** seeded in Events.
  - Multiple **facilities** (Naples + Miami) to demonstrate multi-location + resilience.
  - Sentinel devices seeded across lockers (mix of healthy / needs-attention states).
  - Exit signals seeded so “best exit opportunity” has an immediate answer.

## Core modules (what exists today)

### 1) Dashboard (member)

- **Path:** `/`
- **What it shows:** collection value + trends, recent alerts, exit signals, insurance savings, portfolio/benchmark tease.
- **Demo moment:** “One screen that ties storage conditions + valuation + actions.”

### 2) Collection + wine detail (member)

- **Paths:** `/collection`, `/wine/:id`
- **What you can do:** search/filter inventory, open a wine, view valuation history, storage location, exit signal panel, Deliver Now entry, handoff package, image upload, label scan (when configured).
- **Notes:** Some capabilities are environment-gated (S3 uploads, Vision OCR).

### 3) Locker visualization (member)

- **Path:** `/locker`
- **What it shows:** 4×8 slot grid, slot detail panel, filtering by status/category.
- **Demo moment:** “Physical custody mapped into an intuitive vault grid.”

### 4) Sentinel monitoring (member)

- **Path:** `/sentinel`
- **What it shows:** live readings + charts (temp/humidity/vibration/light), alert thresholds, access log.
- **What’s real vs simulated:**
  - Live charts include a client-side simulation loop for demo polish.
  - There is also a real device ingest endpoint at `/api/ingest/sensor` (bearer-guarded) and persistence for historical readings.

### 5) CCR (Custody & Condition Report) + verification (member + public)

- **Member report:** `/report/:id`
- **Public verification:** `/verify/:hash`
- **What it demonstrates:** per-bottle custody record + integrity proof for third-party verification.
- **Related:** NFC tap landing `/bottle/:tagId` (public) for “scan collar → verify record” narrative.

### 6) AI Advisor (member)

- **Path:** `/advisor`
- **What it does:** streaming chat wired to a tool layer (portfolio, alerts interpretation, exit signals, insurance estimate, allocations/appraisals/acquisitions/exits summaries).
- **Notes:** hard-gated when `ANTHROPIC_API_KEY` is unset (route returns a friendly 503 and UI renders a disabled state).

### 7) Portfolio vs benchmark (member / investor surface)

- **Path:** `/portfolio`
- **What it shows:** portfolio performance + comparison vs Liv-ex 100 (indexed series).
- **Demo moment:** “Investment-grade view; not just bottle counting.”

### 8) Founding Member pricing + settings (member)

- **Path:** `/settings`
- **What it shows:** tier details, Founding Member pricing/benefits bundle, alert preferences, hurricane preferences.

### 9) Deliver Now (member + driver)

- **Member ladder:** `/deliveries/:id`
- **Driver portal:** `/handoff-driver/:token` (public token URL)
- **What it demonstrates:** slide-7 “trust & compliance” ladder: biometric re-auth → PIN → address → OTP (>$2K), then door-side ID scan → name match → authorized recipient → photo/timestamp.
- **Implementation note:** biometric step uses WebAuthn platform authenticator (so “Face ID / Touch ID” is real for supported devices).

### 10) Events & tastings (public + member + admin)

- **Public list/detail:** `/events`, plus `/events/[slug]` for public events. Member-only event detail pages require sign-in.
- **Member actions:** RSVP (1–4 seats), cancel.
- **Non-member:** signup form (lead capture).
- **Admin:** create/edit events, roster, CSV export (`/admin/events/*`).

### 11) Concierge migration (member + admin)

- **Member wizard:** `/migrations/new` (CSV parse + mapping + submit request)
- **Admin queue:** `/admin/migrations` (status filters + fulfillment)
- **Demo moment:** “Removes switching friction; 48-hour white-glove fulfillment workflow.”

### 12) Exit signals → exit facilitation (member + admin)

- **Signals surfaces:** dashboard + wine detail panel + Advisor tool.
- **Member exits:** `/exits` + `/exits/new?wineId=...` + `/exits/:id`
- **Admin exits:** `/admin/exits/*` (queue + lifecycle + close-sale transaction)
- **What it demonstrates:** “we don’t just price bottles; we help members exit.”

### 13) Insurance surfaces (member)

- **Insurance savings estimate:** dashboard + `/portfolio` + Advisor tool.
- **Insurance partner program:** surfaced via product copy/CTAs (admin reference lives under `/admin` as needed).

### 14) Private allocations (member + admin)

- **Member feed:** `/allocations`
- **Admin authoring + queue:** `/admin/allocations/*`
- **Key detail:** fulfillment writes `Wine` rows with a `sourceAllocationId` back-link (provenance).

### 15) Welcome appraisal (member + admin + public verify)

- **Member:** `/appraisals` + `/appraisals/new`
- **Admin queue:** `/admin/appraisals`
- **PDF:** server-rendered download endpoint + public verify path via `/verify/*`.

### 16) Acquisition sourcing (member + admin)

- **Member:** `/acquisitions`
- **Admin queue:** `/admin/acquisitions`
- **Key detail:** fulfillment writes `Wine` rows with a `sourceAcquisitionId` back-link; margin is admin-only.

### 17) Sentinel fleet + inventory (admin)

- **Paths:** `/admin/sentinels/*`
- **What it shows:** device registry, battery/firmware/connectivity, assignment, event log, needs-attention filters.

### 18) Facilities + resilience (admin + member)

- **Admin:** `/admin/facilities/*` (multi-location management)
- **Member facility views:** `/facility/*` plus resilience post-event reports under `/facility/events/*`.

### 19) Waitlist + LOIs (public + admin)

- **Public:** `/waitlist`
- **Admin:** `/admin/waitlist` (export + triage)

### 20) Mobile companion app (Expo) (staff + optional push)

- **Location:** `mobile/`
- **What it is:** a bearer-token mobile companion (not NextAuth cookie sessions).
- **Key staff flow:** “Scan” tab supports barcode scan → lookup → check-in/out against locker slots via `/api/mobile/lockers/scan/*`.
- **Push notifications:** optional; disabled by default unless `EXPO_PUSH_ENABLED=true` (web app env).

## Environment-gated capabilities (quick reference)

- **AI Advisor:** `ANTHROPIC_API_KEY`
- **Liv-ex sync:** `LIVEX_API_KEY` (+ optional `CRON_SECRET`)
- **Wine image upload:** `AWS_S3_BUCKET` (+ optional `AWS_CLOUDFRONT_DOMAIN`)
- **Label scan (Vision OCR):** `GOOGLE_CLOUD_VISION_API_KEY`
- **Alert emails:** `AWS_SES_FROM_EMAIL`
- **Distributed rate limiting:** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- **Device ingest auth:** `SENTINEL_INGEST_SECRET`

## What to write next

- Use this doc as the backbone for:
  - `docs/INVESTOR-DEMO-TALK-TRACK.md` (script + click-path)
  - `docs/INVESTOR-MATERIALS-MAP.md` (deck claims → proof points / answers)
