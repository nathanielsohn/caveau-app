# Caveau — Wine Cellar Management + IoT Monitoring MVP

## What This Is

A luxury wine cellar management web app. Demonstrates the full Caveau value chain: wine inventory → storage lockers → Sentinel environmental monitoring → Caveau Custody & Condition Reports → valuations.

**Current state:** All 14 core demo features + 3 stretch goals are complete. Post-demo roadmap is in progress — 32 of 47 roadmap features are done (15, 16, 17, 18, 19, 20, 21, 23, 24, 26, 28, 30, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 49, 50, 51, 52, 53, 54, 55). Auth, API routes, valuation engine, analytics, certificates, disposition tracking, locker self-service, collection/locker filtering, alert email notifications, member onboarding, multi-facility support, wine image upload, wine label scanning, the AI Advisor chat surface, biometric-verified Deliver Now (with FL DABT age verification at handoff), the events & tasting module (with Naples Winter Wine Festival seeded as the flagship demo event), Founding Member pricing (discounted locked rates + benefits bundle, surfaced in the onboarding wizard and on /settings), the concierge CSV migration flow (CellarTracker + Vivino import with an admin fulfillment queue), and AI-surfaced exit signals (drink-window + price momentum scoring, dashboard card, wine detail panel with handoff CTA, Advisor tool) are all live. Phase 4 (vault business — Liv-ex live pricing, provenance timeline, auction handoff, facility resilience) was added after the April 2026 investor review. Phase 5 (investor-ready — NFC tracking, membership tiers, investment portfolio view, hurricane protection protocol, exit facilitation, home cellar program, founding member waitlist) was added after Rob's April 15 business docs. **Phase 6 (investor demo gap, features #50–62) was added 2026-04-16 after skimming the pitch deck — it's the current "what's next" priority. All five P0 items (#50 AI Advisor, #51 Deliver Now, #52 Concierge migration, #53 Events, #54 Founding Member pricing) are complete; #55 Exit signals shipped 2026-04-18; next up in P1 is #56 Insurance savings estimate and #57 Portfolio vs. Liv-ex 100. Full gap analysis at [`docs/PHASE-6-INVESTOR-DEMO-GAP.md`](docs/PHASE-6-INVESTOR-DEMO-GAP.md).** See SPEC.md "Post-Demo Roadmap" for full status. Note: SPEC.md uses ~~strikethrough~~ for both "done" and "deprioritized" (#33 Wine marketplace is killed, not built) — the count above excludes #33. Total nominal feature count is 48 (#15–#62); 47 after excluding the deprioritized #33.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS v3** (custom dark luxury theme)
- **Recharts v2** (IoT charts)
- **Framer Motion** (animations)
- **Lucide React** (icons)
- **RDS PostgreSQL** (AWS free tier database)
- **Prisma** (ORM, type-safe queries, migrations)
- **NextAuth.js v4** (auth, JWT sessions, Credentials provider)
- **bcryptjs** (password hashing)
- **Zod** (request/body validation via `src/lib/schemas.ts`)
- **AWS SDK v3** — S3 + presigner (wine image upload, #18), SES (alert email, #19)
- **Anthropic SDK** (AI Advisor chat streaming, #50 — Claude Sonnet 4.6)
- **Google Cloud Vision** (wine label OCR via REST, #24)
- **Upstash Redis** (distributed rate limiting; in-memory fallback when unset)
- **pdf-lib** + **qrcode.react** (Custody & Condition Report PDF + QR)
- **Vitest** (unit tests in `src/lib/__tests__/`)
- **Vercel** (hosting + cron)

## How to Run

```bash
npm install
npm run dev
```

Requires `.env` with:
```
DATABASE_URL=postgresql://<user>:<password>@<rds-host>:5432/caveau
# Production note: append `?connection_limit=5&pool_timeout=10` so each
# Vercel Lambda caps its Prisma pool and can't exhaust the RDS
# connection budget on a traffic spike. Migrate to RDS Proxy once
# steady-state traffic justifies it.
NEXTAUTH_SECRET=<random-base64-string>

# Optional — NextAuth falls back to the request host / VERCEL_URL when
# unset. Set it explicitly for local dev or when attaching a custom domain.
NEXTAUTH_URL=http://localhost:3000

# Optional — when "true", the login page renders the demo credentials
# block (`robert@caveau.com` / `demo1234`). Leave unset in production.
NEXT_PUBLIC_SHOW_DEMO_CREDS=true

# Optional — Sentry DSN for error tracking. When unset, `src/lib/env.ts`
# leaves `env.SENTRY_DSN` undefined and the app runs without Sentry
# instrumentation. Wire this up in production.
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>

# Optional — dedicated HMAC keys for Caveau Custody & Condition Report hashes
# (src/lib/certificate-hash.ts) and the signed facility-switcher cookie
# (src/lib/current-facility.ts). Both fall back to NEXTAUTH_SECRET when
# unset, which is fine for dev/demo; set independent random values in
# production so a leak of one secret doesn't compromise the others.
CERTIFICATE_HMAC_SECRET=
FACILITY_COOKIE_SECRET=

# Optional — enables distributed rate limiting via Upstash Redis. If
# either var is unset, src/lib/rate-limit.ts falls back to the per-Lambda
# in-memory limiter (fine for dev, not a real ceiling in prod because
# each cold start resets the counter).
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Optional — enables alert email notifications via AWS SES (feature #19).
# If AWS_SES_FROM_EMAIL is unset, the app logs + no-ops instead of sending.
# When SES is live the operator must subscribe an SNS topic to
# `https://<host>/api/ses/webhook` and attach Bounce + Complaint event
# destinations on the SES Configuration Set / Identity. Without that
# subscription, hard-bounced and complaining members keep receiving no
# alerts (because SES drops them) and their dashboard stays silent.
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=alerts@caveau.com

# Optional — enables wine bottle photo uploads to S3 (feature #18).
# If AWS_S3_BUCKET is unset, the upload UI shows a friendly "disabled" state
# and the rest of the app keeps working. AWS_CLOUDFRONT_DOMAIN is optional;
# when set, public image URLs go through the CDN instead of S3 directly.
AWS_S3_BUCKET=caveau-wine-images
AWS_CLOUDFRONT_DOMAIN=d111111abcdef8.cloudfront.net

# Optional — presigned upload URL TTL in seconds. Defaults to 300 (5 min)
# and clamped to [60, 900] in src/lib/env.ts so a typo can't yield a
# 1-second or all-day URL. Bump it if collectors on slow phones see
# frequent "uploaded too late" failures.
S3_UPLOAD_URL_TTL_SECONDS=300

# Optional — enables wine label OCR via Google Cloud Vision (feature #24).
# If GOOGLE_CLOUD_VISION_API_KEY is unset, the Scan Label button renders
# disabled with a tooltip and the rest of the add-wine flow keeps working.
# Restrict the API key to the Vision API only in Google Cloud Console.
GOOGLE_CLOUD_VISION_API_KEY=AIzaSy...

# Optional — enables live Liv-ex price sync (feature #39). When
# LIVEX_API_KEY is unset, `src/lib/livex.ts` short-circuits and the daily
# sync job at `/api/cron/livex-sync` no-ops, so seeded WineValuation data
# renders unchanged. LIVEX_BASE_URL is only needed to point at a sandbox
# or a non-default endpoint. CRON_SECRET is the shared Bearer token that
# guards the sync route in production — Vercel cron sends it automatically
# when set in the project env; manual curl calls must supply the same
# `Authorization: Bearer <secret>` header. Dev requests are allowed when
# CRON_SECRET is unset so local testing doesn't need extra wiring.
LIVEX_API_KEY=livex_live_...
LIVEX_BASE_URL=https://api.liv-ex.com/v1
CRON_SECRET=<random-base64-string>

# Optional — shared Bearer secret that guards the Sentinel device ingest
# endpoint (feature #21) at `/api/ingest/sensor`. Devices send
# `Authorization: Bearer <SENTINEL_INGEST_SECRET>` on every reading. When
# unset, the route allows unauthenticated POSTs in dev/test only so local
# simulation keeps working; staging and production MUST set it or every
# request returns 401.
SENTINEL_INGEST_SECRET=<random-base64-string>

# Optional — enables the AI Advisor chat route (feature #50) at
# `/api/advisor/chat`. When unset, the route returns 503 with
# `{ error: "advisor_not_configured" }` and the rest of the app keeps
# working — same graceful-failure pattern as LIVEX_API_KEY and
# AWS_S3_BUCKET. Get a key from https://console.anthropic.com/.
ANTHROPIC_API_KEY=sk-ant-...
```

## Project Structure

```
prisma/
├── schema.prisma               # Data models (generates TypeScript types)
├── migrations/                 # Flat SQL migrations (0001..0029)
├── seed.ts                     # Seed data script
└── seed-sensors.ts             # Sensor reading seed script
src/
├── app/
│   ├── layout.tsx              # Root layout (fonts, dark bg, SessionProvider)
│   ├── globals.css             # Tailwind + glass-card utilities
│   ├── page.tsx                # Dashboard (server — data fetching)
│   ├── dashboard-client.tsx    # Dashboard (client — metrics, charts, alerts)
│   ├── facility-actions.ts     # Server actions for the nav facility switcher (#16)
│   ├── error.tsx               # Global error boundary
│   ├── not-found.tsx           # 404 page
│   ├── loading.tsx             # Root loading skeleton
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/route.ts  # NextAuth handlers
│   │   │   └── signup/route.ts         # Signup API (CSRF + Zod)
│   │   ├── wines/
│   │   │   ├── route.ts                # GET list (search/filter), POST create
│   │   │   └── [id]/
│   │   │       ├── route.ts            # GET single wine
│   │   │       └── valuations/route.ts # GET + POST valuations
│   │   ├── lockers/
│   │   │   ├── route.ts                # GET list with occupancy
│   │   │   └── [id]/slots/route.ts     # GET slots with wine info
│   │   ├── sensors/
│   │   │   ├── latest/route.ts         # GET latest reading per locker
│   │   │   └── history/route.ts        # GET historical readings (rate-limited)
│   │   ├── alerts/route.ts             # GET recent alerts
│   │   ├── advisor/chat/route.ts       # SSE streaming AI Advisor (#50)
│   │   ├── certificates/[id]/          # GET certificate (ownership-checked) + provenance subroute
│   │   ├── cron/
│   │   │   ├── livex-sync/route.ts     # Daily Liv-ex price sync (#39)
│   │   │   └── sensor-retention/route.ts # Nightly 90-day raw-reading purge
│   │   ├── deliveries/                 # Deliver Now member + door-side APIs (#51)
│   │   │   ├── [id]/{address,biometric,cancel,otp,otp/send,pin}/route.ts
│   │   │   └── by-token/[token]/{complete,handoff-start,id-scan,upload-url}/route.ts
│   │   ├── ingest/sensor/route.ts      # Sentinel device ingest (#21)
│   │   ├── ses/webhook/route.ts        # SES bounce/complaint webhook (#19)
│   │   └── health/route.ts             # Public uptime probe
│   ├── admin/                          # Admin RBAC surfaces (#28)
│   │   ├── layout.tsx + page.tsx + error.tsx + loading.tsx
│   │   ├── alerts/                     # Alert triage
│   │   ├── events/{new,[id]/export}/   # Event authoring + per-event CSV export (#53)
│   │   ├── hurricane/{new,[id]}/       # Hurricane protocol authoring (#46)
│   │   ├── lockers/                    # Locker admin
│   │   ├── members/                    # Member directory
│   │   └── waitlist/                   # Founding-member waitlist + CSV export (#49)
│   ├── advisor/                        # AI Advisor chat UI (#50)
│   │   ├── page.tsx + chat-client.tsx + error.tsx + loading.tsx
│   ├── auth/                           # login, signup
│   ├── bottle/[tagId]/                 # NFC-tag landing (#43)
│   ├── certificate/[id]/               # Legacy redirect → /report/[id]
│   ├── collection/                     # Wine inventory (server + client + label-scan action)
│   ├── deliveries/[id]/                # Deliver Now member ladder UI (#51)
│   ├── events/                         # Events & tastings — public list, detail, RSVP (#53)
│   │   └── [slug]/                     # Event detail: member RSVP form + public signup form
│   ├── facility/                       # Member-facing facility views (#16)
│   │   └── events/[id]/                # Facility resilience post-event reports (#42) — NOT #53 tastings
│   ├── handoff/                        # Vault-side handoff QR flow (#41)
│   │   └── [token]/                    # Auction/transfer recipient scan
│   ├── handoff-driver/[token]/         # Deliver Now driver portal (#51)
│   ├── locker/                         # Locker visualization
│   ├── onboarding/                     # 3-step tier → locker → first-bottle wizard (#20)
│   ├── portfolio/                      # Investor view (#45, Portfolio vs. Liv-ex 100)
│   ├── report/[id]/                    # Caveau Custody & Condition Report + QR
│   ├── sentinel/                       # IoT monitoring (client — live sim)
│   ├── settings/                       # Alert prefs (#19) + hurricane prefs (#46)
│   ├── verify/[hash]/                  # Public report verification (#30)
│   ├── waitlist/                       # Public founding-member waitlist (#49)
│   └── wine/[id]/                      # Wine detail + disposition/valuation/upload actions
├── middleware.ts               # Auth + onboarding gate, per-route rate limiting, CSP
├── types/
│   └── next-auth.d.ts          # NextAuth type augmentation (role, tier, onboarded on session)
├── components/
│   ├── providers.tsx           # SessionProvider wrapper
│   ├── nav.tsx                 # Sidebar (desktop) + bottom tabs (mobile) — shows session user
│   ├── admin-nav.tsx           # Admin sub-nav (#28)
│   ├── facility-context.tsx    # Client context for nav facility switcher (#16)
│   ├── hurricane-banner.tsx    # Site-wide hurricane-protocol banner (#46)
│   ├── metric-card.tsx         # Animated stat card (icon + value + label)
│   ├── wine-card.tsx           # Wine card with drink window badges
│   ├── wine-image-upload.tsx   # Presigned S3 upload UI (#18) — no-ops when bucket unset
│   ├── scan-label-button.tsx   # Wine label OCR button (#24) — disabled when Vision key unset
│   ├── locker-grid.tsx         # 4×8 slot grid + slot detail panel + filter bar (#38)
│   ├── sensor-charts.tsx       # Recharts (temp, humidity, vibration, access log)
│   ├── dashboard-charts.tsx    # Analytics (value trend, utilization, alert freq)
│   ├── alert-list.tsx          # Alert history table
│   ├── certificate-doc.tsx     # Caveau Custody & Condition Report layout + QR code
│   ├── provenance-timeline.tsx # Bottle-level chain-of-custody timeline (#40)
│   ├── handoff-package-button.tsx # Auction/transfer handoff QR trigger (#41)
│   ├── add-wine-form.tsx       # Add wine modal/form
│   ├── disposition-form.tsx    # Wine disposition modal (<dialog>)
│   ├── valuation-chart.tsx     # Wine valuation price history chart
│   ├── toast.tsx               # Global toast system (showToast + <Toaster />)
│   └── skeleton.tsx            # Loading skeleton primitives
└── lib/
    ├── auth.ts                 # NextAuth config + getServerAuth() helper
    ├── prisma.ts               # Prisma client singleton
    ├── env.ts                  # Boot-time env validation
    ├── logger.ts               # Structured logging wrapper
    ├── request-context.ts      # Request-ID propagation for log correlation
    ├── rate-limit.ts           # Upstash-backed limiter with in-memory fallback
    ├── safe-callback.ts        # Open-redirect-safe callbackUrl validator
    ├── schemas.ts              # Zod request/body schemas + parseOr400 helper
    ├── current-facility.ts     # Facility cookie read/write for #16 switcher
    ├── tiers.ts                # Tier slugs, copy, entitlement specs
    ├── email.ts                # AWS SES client + send() wrapper (no-op when unset)
    ├── notify-alert.ts         # Alert → email dispatch with cooldown tracking (#19)
    ├── validate-live-alert.ts  # Guard for /sentinel live-sim alert writes
    ├── s3.ts                   # Presigned upload URLs + getPublicUrl (#18)
    ├── vision.ts               # Google Vision wine-label OCR (#24)
    ├── label-parser.ts         # Post-OCR producer/vintage/region extraction (#24)
    ├── certificate-hash.ts     # HMAC CCR hash generation/verification (#30)
    ├── provenance.ts           # Provenance timeline aggregation (#40)
    ├── provenance-pdf.ts       # Server-rendered CCR PDF export (#40)
    ├── handoff.ts              # Handoff package tokens + state machine (#41)
    ├── disposition-guard.ts    # Invariants for wine disposition transitions
    ├── nfc.ts                  # NFC tag ID hashing + lookup (#43)
    ├── hurricane.ts            # Hurricane protocol state + member opt-ins (#46)
    ├── investment.ts           # Portfolio vs. Liv-ex 100 math (#45)
    ├── delivery.ts             # Deliver Now state machine + PIN/OTP (#51)
    ├── advisor-system-prompt.ts # Builds the AI Advisor system prompt (#50)
    ├── advisor-tools.ts        # Portfolio/tier/alert tool implementations (#50)
    ├── advisor-dispatch.ts     # Tool definitions + dispatch (#50)
    ├── livex.ts                # Liv-ex HTTP client (#39)
    ├── use-body-scroll-lock.ts # Hook for locking background scroll behind modals
    ├── sensors.ts              # Sensor simulation algorithm + thresholds
    ├── utils.ts                # Currency, date, number formatters
    └── __tests__/              # Vitest unit tests for lib helpers
```

### Data Models (key schema notes)

- **Facility** — Multi-location ready. Demo seeds one facility ("Caveau Naples"). Lockers have optional `facilityId`.
- **Member.role** — `'admin' | 'staff' | 'member'`. Demo uses `'member'`. Enables RBAC in Phase 1.
- **Member.onboardedAt** — `DateTime?`. Null until the member finishes the `/onboarding` wizard (#20). Mirrored on the JWT as `session.user.onboarded` so middleware can gate routes without an extra DB query. Existing rows are backfilled to NOW() in migration 0005.
- **WineValuation** — Price history table. Seeds 4-6 entries per wine with sources: manual, liv-ex, wine-searcher, auction. Powers dashboard analytics trend chart.
- **WineDisposition** — Audit trail for wines leaving the collection (sold, transferred, consumed, gifted, removed). Uses `onDelete: Restrict` on the wine FK to prevent accidental deletion of wines with disposition history. Unique constraint on `(wineId, type, date)` prevents duplicate entries.
- **SensorReading.id** — Uses `autoincrement()` (not UUID) for write performance at scale.
- **Prisma Decimals** — `purchasePrice`, `currentValue`, and all sensor fields return `Prisma.Decimal` objects, not numbers. Always use `Number()` or `.toNumber()` before arithmetic. Format with `utils.ts` helpers for display. Formatting helpers in `utils.ts` should accept `Prisma.Decimal | number | string` defensively to prevent silent `[object Object]` rendering.

## Design Conventions

- **Dark theme always.** Background: #0A0A0B. Cards: #141416 at 80% opacity with backdrop-blur.
- **Gold accent** (#FFD166) for primary buttons, highlights, chart fills.
- **Burgundy accent** (#C23152) for wine-related elements.
- **Playfair Display** (serif) for headings, wine names, certificate titles.
- **Inter** (sans-serif) for body text, labels, data.
- **Glassmorphism cards:** `bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl`
- **Mobile-first.** All layouts must work at 375px width.
- **Caveau diamond** (◈) is the brand logo character.

## Sensor Simulation

Live sensor data is generated client-side with `setInterval` (every 5 seconds). See SPEC.md for the full simulation formulas.

Alert thresholds: temp >59°F or <50°F, humidity <55% or >75%, vibration >0.5 mm/s.

Access monitoring (door/badge events) is displayed alongside environmental sensors. Access events are seeded as alerts and simulated client-side in the access log.

Historical data (30 days) is pre-seeded in the database using the same algorithm.

## Auth System

- **NextAuth.js v4** with Credentials provider (email/password), JWT session strategy
- **Middleware** (`src/middleware.ts`) protects all routes except `/auth/*`, `/verify/*`, `/api/auth/*`, `/api/health`. Authenticated members whose `onboardedAt` is null are routed to `/onboarding` for the guided walkthrough; completed members are bounced back to `/` if they revisit `/onboarding`. `/certificate/*` pages are auth-protected and the page enforces an ownership check before rendering.
- **Session data** includes `id`, `name`, `email`, `role`, `tier`, `onboarded` (see `src/types/next-auth.d.ts`)
- **Server-side auth**: use `getServerAuth()` from `src/lib/auth.ts` in server components/actions
- **Client-side auth**: use `useSession()` from `next-auth/react` (app is wrapped in `SessionProvider`)
- **All data queries are scoped to the authenticated member** — wines, lockers, alerts, sensor readings
- **Demo credentials**: `robert@caveau.com` / `demo1234` (only shown on login page in development)
- **Email normalization**: emails are lowercased and trimmed on both login and signup
- **Signup** creates a new member with role `"member"` and tier `"gold"` (re-confirmed in the onboarding wizard), minimum 10-char password with uppercase + lowercase + digit required, email format validated. Returns 201 for both new and existing accounts to prevent user enumeration. CSRF double-submit cookie validated via SHA-256 hash. After signup the client auto-signs in and pushes the user to `/onboarding`.
- **Onboarding wizard** (`/onboarding`, feature #20): three steps — pick tier, reserve a fresh 32-slot locker, add an optional first bottle. The wizard runs server actions for each step and calls `useSession().update()` on completion to refresh the JWT. The `jwt` callback re-reads `tier` and `onboardedAt` from the DB when `trigger === "update"` so middleware sees the new state without a relogin.
- **Password hashing**: bcrypt with 13 rounds (on signup). Login uses `bcrypt.compare` which has no cost parameter.
- **Session timeout**: 1 hour absolute (`maxAge: 3600`) with a 15-minute sliding refresh (`updateAge: 900`) so an active user isn't kicked mid-session but an idle tab goes cold quickly. JWT strategy, no refresh token. See `src/lib/auth.ts` for the config.
- **Rate limiting**: per-IP limits applied in middleware — signup 5/60s (fail-closed), login 10/60s (fail-closed), `/verify/*` and `/bottle/*` and `/handoff/*` and `/handoff-driver/*` 30/60s, `/api/sensors/history` 30/60s, `/waitlist` POST 5/60s. Upstash Redis backend when `UPSTASH_REDIS_REST_*` env vars are set; otherwise an in-memory per-Lambda fallback (fine for dev, resets on cold start in prod).
- **Role values**: `admin`, `staff`, `member` — RBAC guards are live; `/admin/*` is gated to role `admin` in middleware with a layout-level re-check (feature #28).

## Not Yet Implemented (on roadmap)

**Phase 2–3 (remaining):**
- Real IoT sensor data pipeline — partitioning, rollups, retention (#22). Interim mitigation: `/api/cron/sensor-retention` runs nightly at 03:00 UTC and deletes raw `SensorReading` rows older than 90 days. Partitioning + downsampled rollups still need to land before steady-state ingest scales past one or two facilities.
- Locker check-in/out staff workflow (#25)
- Payments / membership (#27)
- Mobile app (#29)
- Insurance integration (#31)
- Multi-location management (#32)
- ~~Wine marketplace (#33)~~ — deprioritized 2026-04-14, dilutes vault-custodian positioning. Not "not yet built" — intentionally killed.

**Phase 5 — Investor-Ready (from Rob's April 2026 business docs):**
- Exit facilitation workflow (#47)
- Home Cellar Program (#48)

**Phase 6 — Investor Demo Gap (see [`docs/PHASE-6-INVESTOR-DEMO-GAP.md`](docs/PHASE-6-INVESTOR-DEMO-GAP.md)):**
- ~~Concierge migration from CellarTracker / Vivino (#52)~~ — done. `MigrationRequest` model added in migration 0033, stores source + column mapping + parsed rows as JSON. Member wizard at `/migrations/new` parses CSV client-side, auto-detects source + column mapping, and submits for 48-hour staff fulfillment. Admin queue at `/admin/migrations` with status filter chips; fulfillment is a single transaction that writes Wine rows and updates `fulfilledWineCount`. Seeded Vivino request for Robert.
- ~~Events & tasting module (#53)~~ — done. Public `/events` list + `/events/[slug]` detail, member RSVP (1–4 seats, cancel), non-member signup form, admin authoring + per-event roster + CSV export. Naples Winter Wine Festival seeded.
- ~~Founding Member pricing (#54)~~ — done. `Tier.reserve` enum value + `Member.foundingMember`/`foundingLockedAt` added in migration 0032. Founding prices ($29/$119/$299/$849) surfaced in the onboarding wizard with "Save $X/mo" badges when the Q3 2027 window is open; bundle card on `/settings` lists Founding Circle benefits with the lock date.
- Exit signals (#55), Insurance savings estimate (#56), Portfolio vs. Liv-ex 100 (#57)
- Sentinel fleet admin (#58), Sentinel inventory / tier assignment (#59)
- Allocation access (#60), Welcome appraisal (#61), Acquisition sourcing (#62)

See SPEC.md "Post-Demo Roadmap" for full details. Done features are marked ~~strikethrough~~ in the tables.

## Key Principles

- **Keep it simple.** ~60 source files total. Colocate related sub-components in the same file.
- **No premature abstractions.** If something is used once, inline it.
- **One developer maintains this.** Optimize for readability, not cleverness.
- **Tried-and-true tech only.** No experimental libraries or bleeding-edge patterns.

## Development Workflow

The user will open Claude Code and ask "what's next", "where are we", or "let's keep going". Here's how to handle that:

### 1. Check Status

Check SPEC.md "Post-Demo Roadmap" tables to see which features are done (marked ~~strikethrough~~) and which are next. Use phase order as the default priority, but the user may jump around.

### 2. Build a Feature

When the user says to go, follow this process:

1. **Read context** — Read the feature's description in SPEC.md. Check related code to understand what already exists.
2. **Build** — Create/edit files. Follow design conventions above exactly.
3. **Verify** — Run `npm run build`. Must exit 0. Fix any errors.
4. **Commit** — `git add` the feature files, commit as `feat(<number>): <short description>`
5. **Mark done** — Update the feature's row in SPEC.md to strikethrough (~~Feature Name~~)
6. **Push** — `git push origin main`

### 3. Tracking

- **SPEC.md** is the source of truth for what's done and what's next (Post-Demo Roadmap section)
- Done features are marked ~~strikethrough~~ in the roadmap tables
