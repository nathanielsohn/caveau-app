# Caveau MVP — Build Pipeline

## Overview

This is a linear build pipeline. There are 14 features listed below in dependency order. Each feature follows the same 5-step process. A runner script feeds them to Claude Code one at a time, top to bottom.

---

## Process Template (every feature follows this)

```
STEP 1: BUILD
  - Read CLAUDE.md and SPEC.md for context
  - Find the feature spec in this file (BUILD.md) — each feature is an inline
    section below (e.g. "### 01 — Project Scaffold")
  - Write/edit all files specified in the feature spec
  - Follow design conventions in CLAUDE.md exactly

STEP 2: VERIFY
  - Run `npm run build` — must exit 0 with no TypeScript errors
  - Run `npm run dev` and verify the feature works (curl or browser check)
  - If build fails, fix errors and re-run until clean

STEP 3: COMMIT
  - `git add` only the files created/modified for this feature
  - `git commit` with message: "feat(<feature-number>): <feature title>"

STEP 4–5: TRACKING (interactive mode only)
  - If running interactively (not inside build.sh), update tracking per CLAUDE.md
  - If running inside the build pipeline, stop here — the pipeline handles the rest
```

---

## Feature Manifest (in build order)

### 01 — Project Scaffold
Create the Next.js 14 project in the current directory (`npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --use-npm --no-import-alias`), install all dependencies (prisma @prisma/client recharts@^2 framer-motion@^11 lucide-react@^0), configure Tailwind theme, globals.css, and root layout with fonts. Create lib files (prisma.ts, utils.ts, sensors.ts). Create Prisma schema matching SPEC.md exactly (includes Facility, WineValuation, Member.role, autoincrement SensorReading.id). Create .env.example template. Initialize BUILD_LOG.md. **Important:** Use `create-next-app@14` (not `@latest`) to ensure the scaffolded files match Next.js 14 conventions. **Important:** Prisma returns `Decimal` fields as `Prisma.Decimal` objects — utils.ts helpers should use `Number()` conversion for formatting.

**Files created:**
- package.json (via create-next-app, then add deps)
- tailwind.config.ts
- next.config.ts
- src/app/layout.tsx
- src/app/globals.css
- src/lib/prisma.ts
- src/lib/utils.ts
- src/lib/sensors.ts
- prisma/schema.prisma
- .env.example
- BUILD_LOG.md

**Verify:** `npm run build` exits 0. Dev server starts. Root page shows default Next.js page (will be replaced later).

---

### 02 — Database Schema & Seed Data
Prisma schema is already created in feature 01. Create seed.ts with: 1 facility ("Caveau Naples", "Naples, FL"), demo member (role "member"), wines (35), lockers (2, assigned to facility), locker slots (24 occupied), alerts (8), provenance certificates (5), and 1 WineValuation per wine (source "manual", price = currentValue, date = createdAt). Create seed-sensors.ts script that generates 30 days of sensor readings. Configure `prisma db seed` in package.json.

**Files created:**
- prisma/seed.ts
- prisma/seed-sensors.ts

**Files modified:**
- package.json (add `prisma.seed` config and `tsx` dev dependency)

**Important:** The sensor seed script generates ~17K rows. Use Prisma `createMany` for batch insertion — individual `create` calls would be extremely slow.

**Verify:** `npx prisma generate` succeeds. `npx prisma migrate dev --name init` creates migration (requires DATABASE_URL). Seed scripts are valid TypeScript. `npm run build` still exits 0.

---

### 03 — Navigation Component
Build the app shell: sidebar for desktop (Caveau ◈ logo, 4 nav links: Dashboard, Collection, Locker, Sentinel, member name at bottom) and bottom tab bar for mobile. Update layout.tsx to include nav.

**Files created/modified:**
- src/components/nav.tsx
- src/app/layout.tsx (modified to include nav)

**Verify:** `npm run build` exits 0. All 4 nav links render. Sidebar visible on desktop width, bottom tabs on mobile width.

---

### 04 — Metric Card Component
Build reusable MetricCard component: icon, value (with animated number transition), label, optional trend indicator. Used on dashboard and other pages.

**Files created:**
- src/components/metric-card.tsx

**Verify:** `npm run build` exits 0. Component exports correctly.

---

### 05 — Dashboard Page
Build the dashboard at `/`. Fetches aggregate data via Prisma: total collection value, bottles stored count, current conditions (latest sensor reading), recent alerts. Layout: 4 metric cards in a grid, recent alerts list, top wines by value table.

**Files created/modified:**
- src/app/page.tsx (replace default with dashboard)

**Verify:** `npm run build` exits 0. Page renders with data from database (or gracefully shows empty state if no DB connection).

---

### 06 — Wine Card Component
Build WineCard component for collection grid: wine image (placeholder), name (serif font), vintage, region badge, current value. Clickable → links to /wine/[id].

**Files created:**
- src/components/wine-card.tsx

**Verify:** `npm run build` exits 0. Component exports correctly.

---

### 07 — Collection Page
Build wine collection page at `/collection`. Search bar, filter dropdowns (region, varietal, vintage range), grid/list view toggle. Uses WineCard in grid mode. Fetches wines via Prisma with client-side filtering. Includes AddWineForm modal.

**Files created/modified:**
- src/app/collection/page.tsx
- src/components/add-wine-form.tsx

**Verify:** `npm run build` exits 0. Page renders wine grid. Search filters work client-side. Add wine form opens as modal.

---

### 08 — Locker Page
Build locker visualization at `/locker`. Header shows locker number, zone, occupancy count. LockerGrid component: 4×8 CSS grid of slots. Empty slots have dashed border. Occupied slots show wine name + varietal color. Click occupied slot → slide-in detail panel with bottle info and link to wine detail.

**Files created/modified:**
- src/components/locker-grid.tsx
- src/app/locker/page.tsx

**Verify:** `npm run build` exits 0. Grid renders 32 slots. Occupied slots are visually distinct. Click opens detail panel.

---

### 09 — Sensor Charts Component
Build all Recharts visualizations in one file: TemperatureChart (AreaChart with gold gradient fill, red reference lines at 50°F and 59°F), HumidityChart (LineChart, blue), VibrationGauge (radial or bar gauge with green/yellow/red zones), LightIndicator (icon + status text). All charts accept a `data` prop of sensor readings and handle dark theme styling.

**Files created:**
- src/components/sensor-charts.tsx

**Verify:** `npm run build` exits 0. Components export correctly.

---

### 10 — Alert List Component
Build alert history table: columns for time, type, severity (color-coded badge), message, resolved status. Accepts alerts array as prop.

**Files created:**
- src/components/alert-list.tsx

**Verify:** `npm run build` exits 0. Component exports correctly.

---

### 11 — Sentinel Page
Build IoT monitoring dashboard at `/sentinel`. Time range selector (1H/6H/24H/7D/30D toggle). 4 condition cards showing current temp/humidity/vibration/light with status colors. Charts from sensor-charts.tsx. Alert history from alert-list.tsx. Live-updating: uses setInterval with sensor simulator from lib/sensors.ts for real-time data, fetches historical from database via Prisma for longer ranges.

**Files created/modified:**
- src/app/sentinel/page.tsx

**Verify:** `npm run build` exits 0. Charts render. Live data updates every 5 seconds. Time range selector switches between live and historical data.

---

### 12 — Wine Detail Page
Build wine detail at `/wine/[id]`. Fetches wine by ID via Prisma with included lockerSlots relation. Layout: wine image + info header, valuation card (purchase vs current, appreciation %), tasting notes, storage location (locker number, slot, days stored), link to provenance certificate.

**Files created/modified:**
- src/app/wine/[id]/page.tsx

**Verify:** `npm run build` exits 0. Page renders wine details. Navigation from collection page works. Provenance link present for wines with certificates.

---

### 13 — Provenance Certificate Page
Build certificate at `/certificate/[id]`. Standalone full-page layout (no sidebar). Gold double-line border. Caveau ◈ logo centered. Wine info, monitoring period, environmental summary (temp mean/min/max, humidity mean), data integrity badge (SHA-256 hash, green checkmark), certificate number. Print button + print CSS to hide non-document elements.

**Files created/modified:**
- src/components/certificate-doc.tsx
- src/app/certificate/[id]/page.tsx

**Verify:** `npm run build` exits 0. Certificate renders with all data. Print preview shows clean document.

---

### 14 — Polish & Animations
Add Framer Motion animations across all pages: fade-in on page load, stagger on grid items (wine cards, locker slots, metric cards), scale-on-hover for interactive cards, smooth number transitions on metric values. Add loading skeleton states to all pages. Mobile responsiveness check — verify all pages work at 375px. Fix any layout issues found.

**Files modified:**
- src/app/page.tsx
- src/app/collection/page.tsx
- src/app/locker/page.tsx
- src/app/sentinel/page.tsx
- src/app/wine/[id]/page.tsx
- src/components/metric-card.tsx
- src/components/wine-card.tsx
- src/components/locker-grid.tsx
- (any other files needing animation/polish)

**Verify:** `npm run build` exits 0. Animations play on page load. Cards scale on hover. Loading states appear briefly. All pages render correctly at 375px width.

---

> **Note:** Stretch goal numbers 15–17 below are build pipeline IDs only. They are unrelated to the post-demo roadmap feature numbers in SPEC.md, which use a separate numbering scheme (15–33).

### 15 — API Routes (stretch goal)
Create REST API endpoints wrapping existing Prisma queries. These decouple data access from the UI and establish the pattern for future mobile app, POS, and IoT integrations. All routes return JSON. Use Next.js Route Handlers (`app/api/.../route.ts`).

**Endpoints:**
- `GET /api/wines` — list all wines for the demo member (supports `?search=`, `?region=`, `?varietal=` query params)
- `GET /api/wines/[id]` — single wine with locker slot and valuations
- `POST /api/wines` — create a wine (body: name, vintage, region, varietal, producer, purchasePrice)
- `GET /api/lockers` — list lockers with slots and occupancy counts
- `GET /api/lockers/[id]/slots` — slots for a specific locker with wine info
- `GET /api/sensors/latest` — latest sensor reading per locker
- `GET /api/sensors/history?lockerId=&range=` — historical readings (range: 1h, 6h, 24h, 7d, 30d)
- `GET /api/alerts` — recent alerts (supports `?resolved=true/false`)
- `GET /api/certificates/[id]` — certificate with wine and locker data

**Files created:**
- src/app/api/wines/route.ts
- src/app/api/wines/[id]/route.ts
- src/app/api/lockers/route.ts
- src/app/api/lockers/[id]/slots/route.ts
- src/app/api/sensors/latest/route.ts
- src/app/api/sensors/history/route.ts
- src/app/api/alerts/route.ts
- src/app/api/certificates/[id]/route.ts

**Verify:** `npm run build` exits 0. `curl http://localhost:3000/api/wines` returns JSON array of wines. `curl http://localhost:3000/api/sensors/latest` returns latest readings.

---

### 16 — Dashboard Analytics (stretch goal)
Enhance the dashboard (feature 05) with trend charts: collection value over time (line chart using WineValuation data), storage utilization (occupied vs total slots as donut/radial chart), alert frequency over last 30 days (bar chart grouped by day). Replace static metric snapshots with data that shows movement. Use Recharts components already in the stack.

**Files modified:**
- src/app/page.tsx (add analytics section below existing metric cards)

**Files created:**
- src/components/dashboard-charts.tsx (collection trend, utilization donut, alert frequency bar)

**Verify:** `npm run build` exits 0. Dashboard shows trend charts below the metric cards. Charts render with seeded data. Mobile layout stacks charts vertically.

---

### 17 — Certificate PDF & Public Verification (stretch goal)
Enhance the certificate page (feature 13) with a "Download PDF" button and a public verification page. PDF generation via browser print-to-PDF (CSS `@media print` with clean single-page layout) — no server-side PDF library needed for the demo. Public verification page at `/verify/[hash]` displays a minimal certificate summary (wine name, monitoring period, integrity status) without requiring login. Add a QR code to the certificate that links to the verify URL (use a lightweight QR library like `qrcode.react`).

**Files modified:**
- src/app/certificate/[id]/page.tsx (add download/print button, add QR code)
- src/components/certificate-doc.tsx (add QR code section, refine print styles)

**Files created:**
- src/app/verify/[hash]/page.tsx (public verification page — no nav, minimal layout)

**Dependencies added:**
- `qrcode.react` (lightweight QR code component)

**Verify:** `npm run build` exits 0. Certificate page has a print/download button that produces a clean single-page PDF via browser print. QR code renders on the certificate linking to `/verify/[hash]`. Verify page loads and shows certificate validity.

---

## Runner Script

`build.sh` — a resumable build pipeline that runs features sequentially via Claude Code.

```bash
./build.sh start          # Start or resume from next pending feature
./build.sh start 07       # Start from a specific feature (checks dependencies)
./build.sh stop            # Stop after the current feature finishes
./build.sh status          # Show current build progress
./build.sh retry           # Retry the last failed feature
./build.sh reset <num>     # Reset a feature back to pending
./build.sh reset-all       # Reset all features to pending
./build.sh docs            # Regenerate PROGRESS.md
```

See `build.sh` for the full implementation. The pipeline handles status tracking,
progress docs, GitHub issue closure, and pushing — Claude only needs to build,
verify, and commit.

---

## Pre-Requisites (before running the script)

1. RDS PostgreSQL instance created (see RDS Setup in SPEC.md)
2. `.env` file populated with `DATABASE_URL`
3. `mkdir -p logs` in project root
4. Node.js 18+ installed
5. Claude Code CLI installed and authenticated
