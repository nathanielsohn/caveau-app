# Architecture Decision Records

> Decisions that shaped Caveau's technical direction. Each entry explains what we chose, what we considered, and why.

---

## ADR-001: RDS + Prisma over Supabase

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Needed a database for the MVP. Options were Supabase (hosted Postgres + auth + REST API) or AWS RDS (managed Postgres) with Prisma ORM.

**Decision:** RDS + Prisma.

**Why:**
- Keeps everything on AWS (hosting, database, future services) — single cloud, single bill
- RDS free tier is generous (12 months, db.t3.micro, 20GB)
- Prisma provides type-safe queries and auto-generated TypeScript types from the schema
- No vendor lock-in — standard Postgres, can migrate anywhere
- Supabase auth/REST features aren't needed (demo has no real auth)

**Trade-offs:**
- More manual setup than Supabase (security groups, connection strings)
- No built-in auth — will need NextAuth.js or Clerk in Phase 1

---

## ADR-002: Next.js 14 (not 15)

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Next.js 15 was available but brought breaking changes and newer patterns.

**Decision:** Pin to Next.js 14 via `create-next-app@14`.

**Why:**
- Next.js 14 App Router is stable and well-documented
- Wider ecosystem compatibility (tutorials, Stack Overflow answers, library support)
- "Tried-and-true tech only" principle — no bleeding-edge patterns for a demo
- One developer maintains this — stability over novelty

---

## ADR-003: Prisma 5 (not 7)

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Prisma 7 was the latest version but introduced breaking changes to configuration (moved `url` out of `schema.prisma`, requires `prisma.config.ts`).

**Decision:** Pin to Prisma 5.x.

**Why:**
- Prisma 5 is the most battle-tested version with Next.js 14
- Traditional `schema.prisma` with `url = env("DATABASE_URL")` — simpler, well-documented
- No need for Prisma 7's new features (Prisma Accelerate, etc.) in a demo app
- Avoids configuration complexity for a project maintained by one developer

---

## ADR-004: Recharts over alternatives

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Needed charting for the Sentinel IoT dashboard. Options: Recharts, Chart.js (via react-chartjs-2), Nivo, Victory, Tremor.

**Decision:** Recharts v2.

**Why:**
- Most popular React charting library — huge community, well-documented
- Declarative API that composes naturally with React components
- Good dark theme support via custom styling
- Lightweight enough for 4 chart types (area, line, bar/radial, status)

---

## ADR-005: Client-side sensor simulation

**Date:** 2026-04-10
**Status:** Accepted

**Context:** The demo needs "live" sensor data but has no real IoT devices.

**Decision:** Client-side simulation via `setInterval` every 5 seconds using deterministic formulas with random noise.

**Why:**
- No server load or database writes for live data
- Realistic-looking data (sine wave for diurnal temperature cycles + gaussian noise)
- Threshold checking runs client-side — live alerts appear instantly
- Historical data (30 days) is pre-seeded in the database for time-range queries

**Formula:**
```
temp = 55.0 + sin((hour - 5) × π/12) + gaussian(0, 0.1)
humidity = 65.0 - (temp - 55.0) × 2.0 + gaussian(0, 0.3)
vibration = 0.1 + spike_or_noise
light = rare_spike_or_near_zero
```

---

## ADR-006: Colocated sub-components

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Standard React practice is one component per file. With ~20 source files total, this keeps things compact.

**Decision:** Related sub-components live in the same file as their parent.

**Why:**
- "Keep it simple" and "one developer maintains this" principles
- Fewer files to navigate, less import boilerplate
- Sub-components are tightly coupled to their parent anyway
- Example: `sensor-charts.tsx` contains TemperatureChart, HumidityChart, VibrationGauge, and LightIndicator

---

## ADR-007: Server Actions over API routes

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Client components (like Sentinel) need to fetch data from the database. Options: Next.js API routes (`/api/...`) or Server Actions.

**Decision:** Server Actions for data fetching from client components.

**Why:**
- No separate API route files needed — keeps file count low
- Type-safe end-to-end (TypeScript function call, not HTTP)
- Simpler than setting up REST endpoints for internal data access
- API routes are a stretch goal (Feature 15) for external/mobile consumption
