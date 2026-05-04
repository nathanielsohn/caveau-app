# ◈ Caveau

**Luxury wine cellar management with IoT monitoring and Caveau Custody & Condition Reports.**

Caveau is a web application for managing wine collections, visualizing locker storage, monitoring environmental conditions via IoT sensors, and issuing Caveau Custody & Condition Reports (CCRs) to document chain of custody for fine wine.

## Quick Start

Requires **Node.js 20+** (see `package.json` `engines.node`).

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
| Dashboard | `/` | Collection value, conditions, recent alerts, exit signals, insurance savings |
| Collection | `/collection` | Wine inventory with search + filters |
| Locker | `/locker` | Visual 4×8 slot grid with bottle details |
| Sentinel | `/sentinel` | Live IoT monitoring: temp, humidity, vibration, light |
| Wine Detail | `/wine/:id` | Full bottle profile with valuation |
| Report | `/report/:id` | Caveau Custody & Condition Report (CCR) with data integrity proof |
| Verify | `/verify/:hash` | Public CCR + appraisal verification (no auth) |
| Advisor | `/advisor` | AI Advisor chat with portfolio + pricing tool access (#50) |
| Portfolio | `/portfolio` | Investor view vs. Liv-ex 100 (#45, #57) |
| Onboarding | `/onboarding` | 4-step tier → locker → Sentinel devices → first-bottle wizard (#20, #59) |
| Deliveries | `/deliveries/:id` | Biometric-verified Deliver Now member ladder (#51) |
| Events | `/events` | Tastings + NWWF — RSVP for members, signup form for non-members (#53) |
| Allocations | `/allocations` | Private Allocations feed with eligibility gating (#60) |
| Appraisals | `/appraisals` | Welcome + on-demand valuation documents (#61) |
| Acquisitions | `/acquisitions` | Member-requested bottle sourcing (#62) |
| Exits | `/exits` | Member-initiated consignment — auction / broker / private (#47) |
| Migrations | `/migrations/new` | Concierge CSV import — CellarTracker / Vivino (#52) |
| Admin | `/admin/*` | Members, lockers, alerts, hurricane, waitlist, sentinels, allocations, appraisals, acquisitions, exits, events, migrations (#28) |
| Bottle tap | `/bottle/:tagId` | NFC tap-to-verify public CCR landing (#43) |
| Handoff | `/handoff/:token` | Auction/broker handoff recipient scan (#41) |
| Handoff driver | `/handoff-driver/:token` | Deliver Now driver portal (#51) |
| Waitlist | `/waitlist` | Founding-member waitlist public form (#49) |

See [SPEC.md](./SPEC.md#post-demo-roadmap) for the current roadmap and feature status.

## Stack

- **Next.js 15** (App Router, TypeScript)
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

- [Agent Guide](./AGENTS.md) — ChatGPT/Codex workflow and repo conventions
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
