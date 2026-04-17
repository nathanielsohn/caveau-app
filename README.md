# ◈ Caveau

**Luxury wine cellar management with IoT monitoring and Caveau Custody & Condition Reports.**

Caveau is a web application for managing wine collections, visualizing locker storage, monitoring environmental conditions via IoT sensors, and issuing Caveau Custody & Condition Reports (CCRs) to document chain of custody for fine wine.

## Quick Start

```bash
npm install
cp .env.example .env   # Add your DATABASE_URL
npx prisma generate
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
| Report | `/report/:id` | Caveau Custody & Condition Report (CCR) with data integrity proof |
| Verify | `/verify/:hash` | Public CCR verification (no auth) |

See [SPEC.md](./SPEC.md#post-demo-roadmap) for the current roadmap and feature status.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS v3** (custom dark luxury theme)
- **Recharts v2** (sensor data visualization)
- **Framer Motion** (animations)
- **PostgreSQL** via **Prisma** (AWS RDS)
- **Vercel** (hosting)

## Documentation

Detailed docs are in the [`docs/`](./docs) folder:

- [Architecture](./docs/ARCHITECTURE.md) — stack, directory structure, data flow
- [Data Model](./docs/DATA_MODEL.md) — entities, relationships, ER diagram
- [Getting Started](./docs/GETTING_STARTED.md) — setup, scripts, troubleshooting
- [Design System](./docs/DESIGN_SYSTEM.md) — colors, fonts, components
- [Component Guide](./docs/COMPONENT_GUIDE.md) — every component and its props
- [Auth](./docs/AUTH.md) — NextAuth config, login/signup flows, route protection
- [Deployment](./docs/DEPLOYMENT.md) — AWS RDS + Vercel setup
- [Decisions](./docs/DECISIONS.md) — architecture decision records
- [API Reference](./docs/API.md) — REST endpoints

## License

Private — all rights reserved.
