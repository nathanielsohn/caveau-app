# API Reference

> Last updated: 2026-04-10 18:52 | Feature 01 — Project Scaffold

## Status

API routes are a **stretch goal** (Feature 15). They will be built after all 14 core features are complete.

This document will be auto-populated when the API routes are implemented.

## Planned Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wines` | List wines (supports `?search=`, `?region=`, `?varietal=`) |
| GET | `/api/wines/[id]` | Single wine with locker slot and valuations |
| POST | `/api/wines` | Create a wine |
| GET | `/api/lockers` | List lockers with occupancy counts |
| GET | `/api/lockers/[id]/slots` | Slots for a locker with wine info |
| GET | `/api/sensors/latest` | Latest sensor reading per locker |
| GET | `/api/sensors/history` | Historical readings (`?lockerId=`, `?range=`) |
| GET | `/api/alerts` | Recent alerts (`?resolved=true/false`) |
| GET | `/api/certificates/[id]` | Certificate with wine and locker data |

## Data Access (Current)

Until API routes are built, data flows through:
- **Server Components** — call Prisma directly (Dashboard, Collection, Locker, Wine Detail, Certificate)
- **Server Actions** — called from Client Components (Sentinel page fetches historical data)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for data flow diagrams.
