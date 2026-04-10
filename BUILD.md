# Caveau MVP — Build Pipeline

## Overview

This is a linear build pipeline. There are 14 features listed below in dependency order. Each feature follows the same 5-step process. A runner script feeds them to Claude Code one at a time, top to bottom.

---

## Process Template (every feature follows this)

```
STEP 1: BUILD
  - Read CLAUDE.md and SPEC.md for context
  - Read the feature spec from features/<feature-number>.md
  - Write/edit all files specified in the feature spec
  - Follow design conventions in CLAUDE.md exactly

STEP 2: VERIFY
  - Run `npm run build` — must exit 0 with no TypeScript errors
  - Run `npm run dev` and verify the feature works (curl or browser check)
  - If build fails, fix errors and re-run until clean

STEP 3: COMMIT
  - `git add` only the files created/modified for this feature
  - `git commit` with message: "feat(<feature-number>): <feature title>"

STEP 4: LOG
  - Append to BUILD_LOG.md:
    - Feature number and title
    - Files created/modified
    - Status: PASS or FAIL
    - Any notes or issues encountered

STEP 5: NEXT
  - Move to the next feature in the list
```

---

## Feature Manifest (in build order)

### 01 — Project Scaffold
Create the Next.js 14 project, install all dependencies, configure Tailwind theme, globals.css, and root layout with fonts. Create all lib files (supabase.ts, types.ts, utils.ts, sensors.ts). Create .env.local template. Initialize BUILD_LOG.md.

**Files created:**
- package.json (via create-next-app, then add deps)
- tailwind.config.ts
- next.config.ts
- src/app/layout.tsx
- src/app/globals.css
- src/lib/supabase.ts
- src/lib/types.ts
- src/lib/utils.ts
- src/lib/sensors.ts
- .env.local.example
- BUILD_LOG.md

**Verify:** `npm run build` exits 0. Dev server starts. Root page shows default Next.js page (will be replaced later).

---

### 02 — Supabase Schema & Seed Data
Create schema.sql with all 7 tables. Create seed.sql with demo member, wines (35), lockers (2), locker slots (24 occupied), alerts (8), and provenance certificates (5). Create seed-sensors.ts script that generates 30 days of sensor readings.

**Files created:**
- supabase/schema.sql
- supabase/seed.sql
- supabase/seed-sensors.ts

**Verify:** If NEXT_PUBLIC_SUPABASE_URL is set, run schema.sql and seed.sql via the Supabase client. Otherwise, verify files are valid SQL. `npm run build` still exits 0.

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
Build the dashboard at `/`. Fetches aggregate data from Supabase: total collection value, bottles stored count, current conditions (latest sensor reading), recent alerts. Layout: 4 metric cards in a grid, recent alerts list, top wines by value table.

**Files created/modified:**
- src/app/page.tsx (replace default with dashboard)

**Verify:** `npm run build` exits 0. Page renders with data from Supabase (or gracefully shows empty state if no DB connection).

---

### 06 — Wine Card Component
Build WineCard component for collection grid: wine image (placeholder), name (serif font), vintage, region badge, current value. Clickable → links to /wine/[id].

**Files created:**
- src/components/wine-card.tsx

**Verify:** `npm run build` exits 0. Component exports correctly.

---

### 07 — Collection Page
Build wine collection page at `/collection`. Search bar, filter dropdowns (region, varietal, vintage range), grid/list view toggle. Uses WineCard in grid mode. Fetches wines from Supabase with client-side filtering. Includes AddWineForm modal.

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
Build IoT monitoring dashboard at `/sentinel`. Time range selector (1H/6H/24H/7D/30D toggle). 4 condition cards showing current temp/humidity/vibration/light with status colors. Charts from sensor-charts.tsx. Alert history from alert-list.tsx. Live-updating: uses setInterval with sensor simulator from lib/sensors.ts for real-time data, fetches historical from Supabase for longer ranges.

**Files created/modified:**
- src/app/sentinel/page.tsx

**Verify:** `npm run build` exits 0. Charts render. Live data updates every 5 seconds. Time range selector switches between live and historical data.

---

### 12 — Wine Detail Page
Build wine detail at `/wine/[id]`. Fetches wine by ID from Supabase with joined locker_slot data. Layout: wine image + info header, valuation card (purchase vs current, appreciation %), tasting notes, storage location (locker number, slot, days stored), link to provenance certificate.

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

## Runner Script

`build.sh` — runs each feature sequentially by invoking Claude Code with the feature spec.

```bash
#!/bin/bash
set -e

FEATURES=(01 02 03 04 05 06 07 08 09 10 11 12 13 14)

for f in "${FEATURES[@]}"; do
  echo "=========================================="
  echo "Building feature $f..."
  echo "=========================================="

  claude --print --dangerously-skip-permissions \
    "Read CLAUDE.md and SPEC.md for full project context. Then read BUILD.md and execute feature $f exactly as specified. Follow the 5-step process (BUILD, VERIFY, COMMIT, LOG, NEXT). Do not skip any step. Do not build anything beyond what feature $f specifies." \
    2>&1 | tee "logs/feature-${f}.log"

  echo "Feature $f complete."
  echo ""
done

echo "All features built."
```

---

## Pre-Requisites (before running the script)

1. Supabase project created with URL and anon key
2. `.env.local` file populated with Supabase credentials
3. `mkdir -p logs` in project root
4. Node.js 18+ installed
5. Claude Code CLI installed and authenticated
