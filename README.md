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
| Advisor | `/advisor` | AI Advisor chat with portfolio + pricing tool access (#50) |
| Portfolio | `/portfolio` | Investor view vs. Liv-ex 100 (#45) |
| Onboarding | `/onboarding` | 3-step tier → locker → first-bottle wizard (#20) |
| Admin | `/admin/*` | Members, lockers, alerts, hurricane protocol, waitlist (#28) |
| Bottle tap | `/bottle/:tagId` | NFC tap-to-verify public CCR landing (#43) |
| Handoff | `/handoff/:token` | Auction/broker handoff recipient scan (#41) |
| Waitlist | `/waitlist` | Founding-member waitlist public form (#49) |

See [SPEC.md](./SPEC.md#post-demo-roadmap) for the current roadmap and feature status.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS v3** (custom dark luxury theme)
- **Recharts v2** (sensor data visualization)
- **Framer Motion** (animations)
- **PostgreSQL** via **Prisma** (AWS RDS)
- **NextAuth.js v4** + **bcryptjs** (credentials auth, JWT sessions)
- **Zod** (request validation)
- **AWS SDK v3** (S3 wine images, SES alert email)
- **Anthropic SDK** (AI Advisor chat, Claude Sonnet 4.6)
- **Google Cloud Vision** (wine label OCR)
- **Upstash Redis** (distributed rate limits, optional)
- **pdf-lib** + **qrcode.react** (CCR PDF + QR)
- **Vitest** (unit tests)
- **Vercel** (hosting + cron)

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
