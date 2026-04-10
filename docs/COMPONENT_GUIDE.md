# Component Guide

> Last updated: 2026-04-10 18:52 | Feature 01 — Project Scaffold

## Overview

Caveau uses ~8 shared components, each in its own file under `src/components/`. Related sub-components are colocated in the same file to keep the file count low.

## Components

### nav.tsx
**Status:** Not yet built (Feature 03)

The app shell navigation. Two layouts:
- **Desktop:** Fixed left sidebar — Caveau ◈ logo, 4 nav links (Dashboard, Collection, Locker, Sentinel), member name at bottom
- **Mobile (<768px):** Fixed bottom tab bar with 4 icons

**Used in:** `layout.tsx` (wraps all pages)

---

### metric-card.tsx
**Status:** Not yet built (Feature 04)

Reusable stat card showing an icon, large value, label, and optional trend indicator.

**Props:** `icon`, `value`, `label`, `trend?` (percentage with up/down arrow)

**Used in:** Dashboard, Sentinel condition cards

---

### wine-card.tsx
**Status:** Not yet built (Feature 06)

Wine bottle card for grid/list display. Shows wine image (or placeholder), name (serif font), vintage, region badge, current value. Clickable — links to `/wine/[id]`.

**Props:** Wine object from Prisma

**Used in:** Collection page (grid mode)

---

### locker-grid.tsx
**Status:** Not yet built (Feature 08)

4×8 CSS grid representing a locker's 32 slots. Empty slots have dashed borders. Occupied slots show wine name and varietal-colored accent. Clicking an occupied slot opens a slide-in detail panel.

**Props:** Locker with slots and wine relations

**Used in:** Locker page

---

### sensor-charts.tsx
**Status:** Not yet built (Feature 09)

All Recharts visualizations in one file:
- **TemperatureChart** — AreaChart with gold gradient fill, red reference lines at 50°F and 59°F
- **HumidityChart** — LineChart, blue
- **VibrationGauge** — Radial or bar gauge with green/yellow/red zones
- **LightIndicator** — Icon + status text

**Props:** Array of sensor readings, dark theme styling

**Used in:** Sentinel page

---

### alert-list.tsx
**Status:** Not yet built (Feature 10)

Alert history table with columns: time, type, severity (color-coded badge), message, resolved status.

**Props:** Array of alerts (database + live)

**Used in:** Sentinel page, Dashboard (recent alerts)

---

### certificate-doc.tsx
**Status:** Not yet built (Feature 13)

Full certificate layout: gold double-line border, Caveau ◈ logo centered, wine info, monitoring period, environmental summary, SHA-256 integrity badge, certificate number. Print-optimized.

**Props:** ProvenanceCertificate with wine and locker relations

**Used in:** Certificate page

---

### add-wine-form.tsx
**Status:** Not yet built (Feature 07)

Modal form for adding a new wine. Fields: name, vintage, region, varietal, producer, purchase price. Submits via Next.js Server Action.

**Props:** `isOpen`, `onClose` callbacks

**Used in:** Collection page

---

## Lib Utilities

### prisma.ts
Prisma client singleton. Uses `globalThis` trick to prevent multiple instances in development (hot reload).

### utils.ts
Formatting helpers — all accept `Prisma.Decimal | number | string | null | undefined`:
- `toNumber()` — convert any value to a JS number
- `formatCurrency()` — e.g. "$4,800.00"
- `formatCurrencyCompact()` — e.g. "$4.8K"
- `formatNumber()` — e.g. "4,800" (configurable decimal places)
- `formatTemp()` — e.g. "55.2°F"
- `formatHumidity()` — e.g. "65.0%"
- `formatVibration()` — e.g. "0.12 mm/s"
- `formatLight()` — e.g. "0.5 lux"
- `formatRelativeTime()` — e.g. "2h ago"
- `formatDate()` — e.g. "Mar 15, 2026"
- `percentChange()` — percentage difference between two values

### sensors.ts
Sensor simulation using the specified formulas (sine wave + gaussian noise via Box-Muller transform). Exports `simulateReading()`, `checkThresholds()`, and `THRESHOLDS` constants.
