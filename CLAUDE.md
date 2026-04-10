# Caveau — Wine Cellar Management + IoT Monitoring MVP

## What This Is

A luxury wine cellar management web app for an investor demo. Demonstrates the full Caveau value chain: wine inventory → storage lockers → Sentinel environmental monitoring → provenance certificates → valuations.

**This is a demo app, not production.** No real auth, no real APIs, no real IoT devices. All data is seeded or simulated.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS v3** (custom dark luxury theme)
- **Recharts v2** (IoT charts)
- **Framer Motion** (animations)
- **Lucide React** (icons)
- **Supabase** (Postgres database, free tier)
- **AWS Amplify** (hosting)

## How to Run

```bash
npm install
npm run dev
```

Requires `.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

## Project Structure

```
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
    ├── supabase.ts             # Supabase client singleton
    ├── types.ts                # TypeScript interfaces for all data models
    ├── sensors.ts              # Sensor simulation algorithm + thresholds
    └── utils.ts                # Currency, date, number formatters
```

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

Live sensor data is generated client-side with `setInterval` (every 5 seconds):
```
temp = 55.0 + sin((hour - 5) × π/12) + gaussian(0, 0.1)     // °F
humidity = 65.0 - (temp - 55.0) × 2.0 + gaussian(0, 0.3)     // %
vibration = 0.1 + rare spike (0.5% chance)                     // mm/s
light = 0 normally, rare spike (0.1% chance) for door events   // lux
```

Alert thresholds: temp >59°F or <50°F, humidity <55% or >75%, vibration >0.5 mm/s.

Historical data (30 days) is pre-seeded in Supabase using the same algorithm.

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
