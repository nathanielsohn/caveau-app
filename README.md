# ◈ Caveau

**Luxury wine cellar management with IoT monitoring and provenance certificates.**

Caveau is a web application for managing wine collections, visualizing locker storage, monitoring environmental conditions via IoT sensors, and generating provenance certificates for fine wine authentication.

## Quick Start

```bash
npm install
cp .env.example .env   # Add your DATABASE_URL
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Screens

| Screen | Path | Description |
|--------|------|-------------|
| Dashboard | `/` | Collection value, conditions, recent alerts |
| Collection | `/collection` | Wine inventory with search + filters |
| Locker | `/locker` | Visual 4×8 slot grid with bottle details |
| Sentinel | `/sentinel` | Live IoT monitoring: temp, humidity, vibration, light |
| Wine Detail | `/wine/:id` | Full bottle profile with valuation |
| Certificate | `/certificate/:id` | Provenance certificate with data integrity proof |

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS v3** (custom dark luxury theme)
- **Recharts v2** (sensor data visualization)
- **Framer Motion** (animations)
- **PostgreSQL** via **Prisma** (AWS RDS)
- **AWS Amplify** (hosting)

## Documentation

Detailed docs are in the [`docs/`](./docs) folder:

- [Architecture](./docs/ARCHITECTURE.md) — stack, directory structure, data flow
- [Data Model](./docs/DATA_MODEL.md) — entities, relationships, ER diagram
- [Getting Started](./docs/GETTING_STARTED.md) — setup, scripts, troubleshooting
- [Design System](./docs/DESIGN_SYSTEM.md) — colors, fonts, components
- [Component Guide](./docs/COMPONENT_GUIDE.md) — every component and its props
- [Deployment](./docs/DEPLOYMENT.md) — AWS RDS + Amplify setup
- [Decisions](./docs/DECISIONS.md) — architecture decision records
- [API Reference](./docs/API.md) — REST endpoints (stretch goal)

## Build Progress

See [PROGRESS.md](./PROGRESS.md) for the current build status dashboard.

## License

Private — all rights reserved.
