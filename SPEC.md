# Caveau MVP — Product Spec & Build Plan

## Context

Caveau is a luxury wine bar/retail/speakeasy concept for Naples, FL. The founder (Rob Saenz) and an investor are excited about the tech stack: a wine cellar management app + Sentinel IoT monitoring + provenance certificates. Nathaniel (developer) has been brought in by Sam (GM) to build a working demo app by Monday April 13, 2026. The app will be built by Claude Code in ~3 autonomous sessions over the weekend.

**Constraints:**
- One developer maintaining this long-term
- Keep it simple — fewer files, colocated code, no premature abstractions
- Host on AWS (free tier as much as possible)
- Tried-and-true tech only — nothing bleeding edge

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 14** (App Router, TypeScript) | Industry standard, stable, huge ecosystem |
| Styling | **Tailwind CSS v3** | Proven, fast to iterate, great dark theme support |
| Charts | **Recharts v2** | Most popular React charting lib, well-documented |
| Animations | **Framer Motion** | Standard for React animations, simple API |
| Icons | **Lucide React** | Tree-shakeable, clean icon set |
| Database | **Supabase** (free tier) | Hosted Postgres + JS client + real-time. Zero backend code needed. Free tier: 500MB DB, 1GB storage, 50K monthly active users |
| Hosting | **AWS Amplify** | Git-push deploys like Vercel, but on AWS. Free tier: 1000 build mins, 15GB hosting, 500K requests/month |
| DNS (later) | **Route 53** | If custom domain needed |

**Why Supabase instead of RDS:** For a solo dev, Supabase saves you from managing migrations, building REST endpoints, setting up connection pooling, and configuring auth. You get a Postgres database with an auto-generated API. The free tier is generous enough for a demo and early users. If you outgrow it, you can migrate to RDS later — it's just Postgres underneath.

---

## Screens (6 total)

### 1. Dashboard (`/`)
Overview: collection value, locker status, current conditions, recent alerts, top wines by value.

### 2. My Collection (`/collection`)
Wine list with search + filters (region, varietal, vintage). Grid and list views. Add wine form. Click → wine detail.

### 3. My Locker (`/locker`)
Visual 4×8 grid of locker slots. Empty vs occupied. Click slot → slide-out panel with bottle info.

### 4. Sentinel Monitor (`/sentinel`)
IoT dashboard: 4 condition cards (temp, humidity, vibration, light), temperature area chart, humidity line chart, vibration gauge, alert history. Time range toggle (1H/6H/24H/7D/30D). Live-updating simulated data.

### 5. Wine Detail (`/wine/[id]`)
Full bottle profile: image, producer, region, vintage, tasting notes, purchase price vs current value, storage location, link to provenance certificate.

### 6. Provenance Certificate (`/certificate/[id]`)
Standalone printable page: wine info, monitoring period, environmental summary, SHA-256 integrity badge, certificate number. No sidebar.

---

## Design System

### Colors (defined in tailwind.config.ts)
```
Backgrounds:    #0A0A0B (black), #141416 (charcoal), #1C1C20 (graphite)
Borders:        #2A2A30 (slate)
Text:           #E8E6E1 (primary), #9B9A97 (secondary), #6B6B76 (muted)
Gold:           #FFD166 (accent), #D4A034 (text)
Burgundy:       #C23152 (wine accents)
Status:         #34D399 (ok), #FBBF24 (warn), #F87171 (danger), #60A5FA (info)
```

### Fonts
- **Playfair Display** (serif): headings, wine names, certificate titles
- **Inter** (sans): everything else
- Both loaded via `next/font/google`

### Card Style
All cards use: `bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl`

---

## Data Models (Supabase)

```sql
-- Members
create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  tier text not null check (tier in ('gold', 'platinum', 'black')),
  created_at timestamptz default now()
);

-- Wines
create table wines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vintage integer not null,
  region text not null,
  varietal text not null,
  producer text not null,
  purchase_price numeric(10,2) not null,
  current_value numeric(10,2) not null,
  image_url text,
  tasting_notes text,
  drink_window_start integer,
  drink_window_end integer,
  member_id uuid references members(id),
  created_at timestamptz default now()
);

-- Lockers
create table lockers (
  id uuid primary key default gen_random_uuid(),
  locker_number integer not null unique,
  zone text not null check (zone in ('A', 'B', 'C')),
  member_id uuid references members(id)
);

-- Locker Slots (32 per locker: 4 columns × 8 rows)
create table locker_slots (
  id uuid primary key default gen_random_uuid(),
  locker_id uuid references lockers(id) not null,
  slot_position integer not null,
  wine_id uuid references wines(id),
  date_stored timestamptz,
  unique(locker_id, slot_position)
);

-- Sensor Readings
create table sensor_readings (
  id uuid primary key default gen_random_uuid(),
  locker_id uuid references lockers(id) not null,
  temperature numeric(5,2) not null,
  humidity numeric(5,2) not null,
  vibration numeric(5,3) not null,
  light_lux numeric(8,2) not null,
  timestamp timestamptz not null default now()
);
create index idx_sensor_time on sensor_readings (locker_id, timestamp desc);

-- Alerts
create table alerts (
  id uuid primary key default gen_random_uuid(),
  locker_id uuid references lockers(id) not null,
  type text not null check (type in ('temperature', 'humidity', 'vibration', 'light', 'door')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  message text not null,
  timestamp timestamptz not null default now(),
  resolved boolean default false
);

-- Provenance Certificates
create table provenance_certificates (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid references wines(id) not null,
  locker_id uuid references lockers(id) not null,
  monitoring_start timestamptz not null,
  monitoring_end timestamptz not null,
  temp_mean numeric(5,2),
  temp_min numeric(5,2),
  temp_max numeric(5,2),
  humidity_mean numeric(5,2),
  data_integrity_hash text not null,
  certificate_number text unique not null,
  created_at timestamptz default now()
);
```

### Seed Data
- 1 member: "Alessandro Marchetti", tier "black"
- 2 lockers: #7 (Zone A), #12 (Zone B)
- 35 wines: 5 Caveau private label, 8 investment-grade (DRC, Screaming Eagle, Petrus, etc.), 12 mid-range (Caymus, Silver Oak, etc.), 10 French classics
- 24 occupied locker slots
- 30 days of sensor readings at 5-min intervals (~17K rows)
- 8 historical alerts
- 5 provenance certificates for top wines

### Sensor Simulation (client-side)
```
temp = 55.0 + sin((hour - 5) × π/12) + gaussian(0, 0.1)
humidity = 65.0 - (temp - 55.0) × 2.0 + gaussian(0, 0.3)
vibration = 0.1 + (random() < 0.005 ? random() × 1.5 : |gaussian(0, 0.02)|)
light = random() < 0.001 ? random(50, 200) : max(0, gaussian(0, 0.5))
```
Live updates via `setInterval` every 5 seconds. No SSE/WebSocket needed.

---

## Project Structure (simplified)

```
caveau/
├── CLAUDE.md                    # Build instructions for Claude Code
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── .env.local                   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
├── supabase/
│   ├── schema.sql               # DDL for all tables
│   ├── seed.sql                 # Wines, members, lockers, slots, alerts, certificates
│   └── seed-sensors.ts          # Script to generate 30 days of sensor readings
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout (fonts, dark bg, nav shell)
│   │   ├── globals.css          # Tailwind + custom utilities
│   │   ├── page.tsx             # Dashboard
│   │   ├── collection/
│   │   │   └── page.tsx         # Wine collection
│   │   ├── locker/
│   │   │   └── page.tsx         # Locker visualization
│   │   ├── sentinel/
│   │   │   └── page.tsx         # IoT monitoring
│   │   ├── wine/[id]/
│   │   │   └── page.tsx         # Wine detail
│   │   └── certificate/[id]/
│   │       └── page.tsx         # Provenance certificate
│   ├── components/
│   │   ├── nav.tsx              # Sidebar (desktop) + bottom tabs (mobile)
│   │   ├── metric-card.tsx      # Reusable stat card
│   │   ├── wine-card.tsx        # Wine card for grid view
│   │   ├── locker-grid.tsx      # 4×8 slot grid + slot detail panel
│   │   ├── sensor-charts.tsx    # All Recharts: temp, humidity, vibration, light
│   │   ├── alert-list.tsx       # Alert history table
│   │   ├── certificate-doc.tsx  # Full certificate layout
│   │   └── add-wine-form.tsx    # Add wine modal/form
│   └── lib/
│       ├── supabase.ts          # Client singleton
│       ├── types.ts             # TypeScript interfaces
│       ├── sensors.ts           # Sensor simulation + threshold constants
│       └── utils.ts             # Formatters (currency, date, numbers)
```

**~20 files total** (vs ~50+ in the previous plan). Each component file may contain multiple related sub-components rather than splitting every small piece into its own file.

---

## Build Sessions

### Session 1: Foundation + Dashboard + Collection

1. **Scaffold** — `npx create-next-app@14 caveau` with TypeScript, Tailwind, App Router
2. **Install deps** — `@supabase/supabase-js recharts framer-motion lucide-react`
3. **Configure** — tailwind.config.ts (colors, fonts), globals.css (dark theme, glass-card utility), layout.tsx (Playfair + Inter fonts, dark bg, nav shell)
4. **Lib files** — supabase.ts, types.ts, utils.ts, sensors.ts
5. **Nav component** — Sidebar with Caveau ◈ logo + 4 links (desktop), bottom tab bar (mobile)
6. **Metric card component** — Reusable: icon + value + label + optional trend
7. **Supabase setup** — Create project, run schema.sql, run seed.sql
8. **Dashboard page** — 4 metric cards, recent alerts, top wines, current conditions
9. **Wine card component** — Image, name, vintage, region, value
10. **Collection page** — Search bar, region/varietal/vintage filters, grid/list toggle, wine cards, add wine form

**End of session 1:** Nav works, dashboard shows real data, collection is searchable/filterable.

### Session 2: Locker + Sentinel + Wine Detail

1. **Locker grid component** — 4×8 CSS grid with empty/occupied slot states, click → slide-in detail panel
2. **Locker page** — Locker header (number, zone, occupancy), locker grid
3. **Seed sensor data** — Write and run seed-sensors.ts (30 days of readings)
4. **Sensor simulation** — Client-side generator in sensors.ts
5. **Sensor charts component** — Temperature area chart (gold gradient), humidity line chart (blue), vibration gauge, light indicator. All with Recharts.
6. **Alert list component** — Table with severity badges and timestamps
7. **Sentinel page** — Time range selector, 4 condition cards, charts, alert history, live updating
8. **Wine detail page** — Wine header (image + info), valuation card, tasting notes, storage location, provenance link

**End of session 2:** All 4 main screens working with real + simulated data.

### Session 3: Certificate + Polish + Deploy

1. **Certificate doc component** — Gold-bordered document layout, wine info, environmental summary, integrity badge, certificate number
2. **Certificate page** — Full-page standalone (no sidebar), print styles
3. **Animations** — Framer Motion: page fade-in, grid item stagger, card hover scale, number transitions
4. **Polish** — Loading skeletons, empty states, mobile check at 375px
5. **AWS Amplify deploy** — Connect GitHub repo, set env vars, deploy
6. **Test** — Full demo flow on phone

**End of session 3:** Deployed at AWS Amplify URL, all screens working, polished on mobile.

---

## AWS Amplify Deployment

1. Push code to GitHub
2. Go to AWS Amplify Console → New App → GitHub
3. Select repo and branch
4. Amplify auto-detects Next.js — use the default build settings
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Deploy

Custom domain (optional, later): Add in Amplify Console → Domain Management, or use Route 53.

---

## What to Skip
- Auth (hardcoded demo user)
- Label scanning
- Real API integrations (Liv-ex, Wine-Searcher)
- Real IoT devices
- Payments / membership signup
- Tests
- POS system

---

## Demo Walkthrough (5 min)

1. **Dashboard** (30s) — "$48K collection, 24 bottles stored, conditions optimal"
2. **Collection** (45s) — Filter by Napa. Search "Petrus". Click to detail.
3. **Wine Detail** (30s) — "Purchased $4,500, now $4,800. Stored Locker 7."
4. **Locker** (30s) — "Visual map. Click any slot."
5. **Sentinel** (90s) — "Live monitoring: temp, humidity, vibration, light. Switch 1H → 7D. Alerts fire if conditions drift."
6. **Certificate** (45s) — "543 days continuous monitoring, SHA-256 verified. Carfax for wine."

---

## Verification

After each session:
- `npm run dev` starts clean
- All nav links work
- Data loads from Supabase
- Charts render on Sentinel page
- Works at 375px mobile width
- After session 3: AWS Amplify URL works on phone
