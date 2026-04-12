# Caveau — Wine Cellar Management + IoT Monitoring MVP

## What This Is

A luxury wine cellar management web app. Demonstrates the full Caveau value chain: wine inventory → storage lockers → Sentinel environmental monitoring → provenance certificates → valuations.

**Current state:** All 14 core demo features + 3 stretch goals are complete. Post-demo roadmap is in progress — 8 of 22 roadmap features are done (15, 17, 23, 26, 30, 34, 35, 36). Auth, API routes, valuation engine, analytics, certificates, disposition tracking, and locker self-service are all live. See SPEC.md "Post-Demo Roadmap" for full status.

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
- **Vercel** (hosting)

## How to Run

```bash
npm install
npm run dev
```

Requires `.env` with:
```
DATABASE_URL=postgresql://<user>:<password>@<rds-host>:5432/caveau
NEXTAUTH_SECRET=<random-base64-string>
NEXTAUTH_URL=http://localhost:3000
```

## Project Structure

```
prisma/
├── schema.prisma               # Data models (generates TypeScript types)
├── migrations/                 # SQL migration baseline
├── seed.ts                     # Seed data script
└── seed-sensors.ts             # Sensor reading seed script
src/
├── app/
│   ├── layout.tsx              # Root layout (fonts, dark bg, nav shell)
│   ├── globals.css             # Tailwind + glass-card utilities
│   ├── page.tsx                # Dashboard (server — data fetching)
│   ├── dashboard-client.tsx    # Dashboard (client — metrics, charts, alerts)
│   ├── error.tsx               # Global error boundary
│   ├── not-found.tsx           # 404 page
│   ├── loading.tsx             # Root loading skeleton
│   ├── api/auth/
│   │   ├── [...nextauth]/route.ts  # NextAuth API handler
│   │   └── signup/route.ts         # Signup API (creates member)
│   ├── auth/
│   │   ├── login/page.tsx      # Login page
│   │   └── signup/page.tsx     # Signup page
│   ├── collection/
│   │   ├── page.tsx            # Wine inventory (server)
│   │   ├── collection-client.tsx # Filtering/sorting/grid (client)
│   │   └── loading.tsx
│   ├── locker/
│   │   ├── page.tsx            # Locker visualization (server)
│   │   ├── locker-selector.tsx # Locker tab selector (client)
│   │   ├── actions.ts          # Server actions (assign/remove wine from slot)
│   │   └── loading.tsx
│   ├── sentinel/
│   │   ├── page.tsx            # IoT monitoring (client — live sim)
│   │   ├── actions.ts          # Server actions for sensor data
│   │   └── loading.tsx
│   ├── wine/[id]/
│   │   ├── page.tsx            # Wine detail
│   │   ├── actions.ts          # Server actions (disposition, valuation)
│   │   └── loading.tsx
│   ├── certificate/[id]/
│   │   ├── page.tsx            # Provenance certificate (with QR code)
│   │   └── loading.tsx
│   └── verify/[hash]/
│       ├── page.tsx            # Public certificate verification
│       ├── layout.tsx          # Minimal layout (no sidebar nav)
│       └── loading.tsx
├── middleware.ts                # Route protection, rate limiting, CSP headers
├── types/
│   └── next-auth.d.ts          # NextAuth type augmentation (role, tier on session)
├── components/
│   ├── providers.tsx           # SessionProvider wrapper
│   ├── nav.tsx                 # Sidebar (desktop) + bottom tabs (mobile) — shows session user
│   ├── metric-card.tsx         # Animated stat card (icon + value + label)
│   ├── wine-card.tsx           # Wine card with drink window badges
│   ├── locker-grid.tsx         # 4×8 slot grid + slot detail panel
│   ├── sensor-charts.tsx       # Recharts (temp, humidity, vibration, access log)
│   ├── dashboard-charts.tsx    # Analytics (value trend, utilization, alert freq)
│   ├── alert-list.tsx          # Alert history table
│   ├── certificate-doc.tsx     # Certificate layout + QR code
│   ├── add-wine-form.tsx       # Add wine modal/form
│   ├── disposition-form.tsx    # Wine disposition modal (<dialog>)
│   ├── valuation-chart.tsx     # Wine valuation price history chart
│   └── skeleton.tsx            # Loading skeleton primitives
└── lib/
    ├── auth.ts                 # NextAuth config + getServerAuth() helper
    ├── prisma.ts               # Prisma client singleton
    ├── sensors.ts              # Sensor simulation algorithm + thresholds
    └── utils.ts                # Currency, date, number formatters
```

### Data Models (key schema notes)

- **Facility** — Multi-location ready. Demo seeds one facility ("Caveau Naples"). Lockers have optional `facilityId`.
- **Member.role** — `'admin' | 'staff' | 'member'`. Demo uses `'member'`. Enables RBAC in Phase 1.
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
- **Middleware** (`src/middleware.ts`) protects all routes except `/auth/*`, `/verify/*`, `/api/auth/*`. Note: `/certificate/*` pages are public (middleware allows them) but the `/api/certificates/[id]` API route has its own auth guard + ownership check
- **Session data** includes `id`, `name`, `email`, `role`, `tier` (see `src/types/next-auth.d.ts`)
- **Server-side auth**: use `getServerAuth()` from `src/lib/auth.ts` in server components/actions
- **Client-side auth**: use `useSession()` from `next-auth/react` (app is wrapped in `SessionProvider`)
- **All data queries are scoped to the authenticated member** — wines, lockers, alerts, sensor readings
- **Demo credentials**: `robert@caveau.com` / `demo1234` (only shown on login page in development)
- **Email normalization**: emails are lowercased and trimmed on both login and signup
- **Signup** creates a new member with role `"member"` and tier `"gold"`, minimum 10-char password with uppercase + lowercase + digit required, email format validated. Returns 201 for both new and existing accounts to prevent user enumeration. CSRF double-submit cookie validated via SHA-256 hash.
- **Password hashing**: bcrypt with 12 rounds
- **Session timeout**: 4 hours (14400 seconds), JWT strategy, no refresh token
- **Rate limiting**: in-memory per-IP limiter on auth endpoints (5 requests / 60s window). Note: resets on deploy, does not persist across serverless instances.
- **Role values**: `admin`, `staff`, `member` — RBAC guards are ready but admin panel (roadmap #28) is not yet built

## Not Yet Implemented (on roadmap)

- Multi-facility support (#16)
- Wine image upload (#18)
- Alert notifications via email (#19)
- Member onboarding flow (#20)
- Real IoT device connections (#21, #22)
- Label scanning (#24)
- Locker check-in/out staff workflow (#25)
- Payments / membership (#27)
- Admin panel (#28)
- Mobile app (#29)
- Insurance integration (#31)
- Multi-location management (#32)
- Wine marketplace (#33)

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
