# Caveau — Wine Cellar Management + IoT Monitoring MVP

## What This Is

A luxury wine cellar management web app for an investor demo. Demonstrates the full Caveau value chain: wine inventory → storage lockers → Sentinel environmental monitoring → provenance certificates → valuations.

**This is a demo app, not production.** No real auth, no real APIs, no real IoT devices. All data is seeded or simulated. Schema is forward-looking (includes Facility, WineValuation, Member.role) to minimize migrations when scaling post-demo — see "Post-Demo Roadmap" in SPEC.md.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS v3** (custom dark luxury theme)
- **Recharts v2** (IoT charts)
- **Framer Motion** (animations)
- **Lucide React** (icons)
- **RDS PostgreSQL** (AWS free tier database)
- **Prisma** (ORM, type-safe queries, migrations)
- **AWS Amplify** (hosting)

## How to Run

> **Note:** `npm install` and `npm run dev` require feature 01 (Project Scaffold) to be built first, which creates `package.json` and the Next.js project structure.

```bash
npm install
npm run dev
```

Requires `.env` with:
```
DATABASE_URL=postgresql://<user>:<password>@<rds-host>:5432/caveau
```

## Project Structure

```
prisma/
├── schema.prisma               # Data models (generates TypeScript types)
├── seed.ts                     # Seed data script
└── seed-sensors.ts             # Sensor reading seed script
src/
├── app/
│   ├── layout.tsx              # Root layout (fonts, dark bg, nav shell)
│   ├── globals.css             # Tailwind + glass-card utilities
│   ├── page.tsx                # Dashboard
│   ├── collection/page.tsx     # Wine inventory
│   ├── locker/page.tsx         # Locker visualization
│   ├── sentinel/page.tsx       # IoT monitoring
│   ├── wine/[id]/page.tsx      # Wine detail
│   └── certificate/[id]/page.tsx  # Provenance certificate
├── components/
│   ├── nav.tsx                 # Sidebar (desktop) + bottom tabs (mobile)
│   ├── metric-card.tsx         # Reusable stat card (icon + value + label)
│   ├── wine-card.tsx           # Wine card for grid/list views
│   ├── locker-grid.tsx         # 4×8 slot grid + slot detail panel
│   ├── sensor-charts.tsx       # All Recharts (temp, humidity, vibration, light)
│   ├── alert-list.tsx          # Alert history table
│   ├── certificate-doc.tsx     # Full certificate layout
│   └── add-wine-form.tsx       # Add wine modal/form
└── lib/
    ├── prisma.ts               # Prisma client singleton
    ├── sensors.ts              # Sensor simulation algorithm + thresholds
    └── utils.ts                # Currency, date, number formatters
```

### Data Models (key schema notes)

- **Facility** — Multi-location ready. Demo seeds one facility ("Caveau Naples"). Lockers have optional `facilityId`.
- **Member.role** — `'admin' | 'staff' | 'member'`. Demo uses `'member'`. Enables RBAC in Phase 1.
- **WineValuation** — Price history table. Demo seeds one entry per wine. Enables valuation charts in Phase 2.
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

Historical data (30 days) is pre-seeded in the database using the same algorithm.

## What NOT to Build

- No authentication (hardcoded demo user: "Alessandro Marchetti", Black tier)
- No real API integrations (Liv-ex, Wine-Searcher, etc.)
- No real IoT device connections
- No label scanning
- No payments or membership signup
- No tests
- No POS system

## Key Principles

- **Keep it simple.** ~20 source files total. Colocate related sub-components in the same file.
- **No premature abstractions.** If something is used once, inline it.
- **One developer maintains this.** Optimize for readability, not cleverness.
- **Tried-and-true tech only.** No experimental libraries or bleeding-edge patterns.

## Development Workflow

The user will open Claude Code and ask things like "what's next", "where are we", or "let's keep going". Here's how to handle that:

### 1. Check Status

Read `BUILD_STATUS.json` to find the current state. Report which features are done, which is next, and overall progress (e.g. "5/14 done, next up is feature 06 — Wine Card Component").

### 2. Build a Feature

When the user says to go, follow this process for the next pending feature:

1. **Read context** — Read `BUILD.md` for the feature spec (find the section matching the feature number in BUILD.md — specs are inline, not in separate files)
2. **Build** — Create/edit all files specified. Follow design conventions above exactly.
3. **Verify** — Run `npm run build`. Must exit 0. Fix any errors.
4. **Commit** — `git add` the feature files, commit as `feat(<number>): <title>`

**If running interactively** (user is talking to you directly):

5. **Update tracking** — Run `./scripts/update-status.sh <number> completed` (or `failed` if it broke)
6. **Update docs** — Run `./scripts/update-progress.sh`
7. **Commit tracking** — `git add BUILD_STATUS.json PROGRESS.md BUILD_LOG.md`, commit as `docs: update build progress`
8. **Push** — `git push origin main`

**If running inside the build pipeline** (`build.sh`):

Stop after step 4. The pipeline handles status updates, progress docs, and pushing automatically. Do NOT run `update-status.sh`, `update-progress.sh`, or `git push`.

### 3. Tracking Files

- `BUILD_STATUS.json` — Source of truth. Read this to know what's done/pending/failed.
- `PROGRESS.md` — Human-readable dashboard, auto-generated. Never edit manually.
- `BUILD.md` — Feature specs. Each feature's spec is an inline section in BUILD.md (e.g. "### 01 — Project Scaffold").
- `BUILD_LOG.md` — Build log with pass/fail results per feature. Created by feature 01, updated by pipeline.
- GitHub issues #1–#14 map to features 01–14. They auto-close on completion via `update-status.sh`.
- Features 15–17 are **stretch goals** (API routes, dashboard analytics, certificate PDF + public verify), marked with `"stretch": true` in BUILD_STATUS.json. No GitHub issues. The pipeline skips them automatically — build them individually with `./build.sh start <num>` after 01–14 are done. Note: these numbers are independent from the post-demo roadmap numbering in SPEC.md.
