# Getting Started

> Last updated: 2026-04-10 18:52 | Feature 01 — Project Scaffold

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ (comes with Node)
- **PostgreSQL** database (local or AWS RDS — see [DEPLOYMENT.md](./DEPLOYMENT.md))

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd caveau-app
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env` with your database connection string:
```
DATABASE_URL=postgresql://username:password@host:5432/caveau
```

### 3. Set up database

> **Note:** Migration and seeding require Feature 02 (Database Schema & Seed Data) to be built. If Feature 02 is not yet complete, you can still run the dev server — pages will show empty states or default content.

```bash
# Generate Prisma client (TypeScript types from schema)
npx prisma generate

# Run migrations (creates tables) — requires DATABASE_URL
npx prisma migrate deploy

# Seed demo data (wines, lockers, members, sensors, alerts) — requires Feature 02
npx prisma db seed
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (hot reload) |
| `npm run build` | Production build (type-checks + compiles) |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma generate` | Regenerate Prisma client after schema changes |
| `npx prisma migrate dev --name <name>` | Create a new migration |
| `npx prisma migrate deploy` | Apply pending migrations |
| `npx prisma db seed` | Run seed scripts |
| `npx prisma studio` | Open Prisma Studio (visual DB browser) |

## Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full directory tree and data flow diagrams.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |

## Common Issues

### "Cannot find module '@prisma/client'"
Run `npx prisma generate` — the client is generated from the schema, not included in node_modules by default.

### "P1001: Can't reach database server"
Check that your DATABASE_URL is correct and the database is accessible. For RDS, ensure your IP is in the security group's inbound rules.

### "Decimal" type errors in components
Prisma returns `Decimal` fields as objects, not numbers. Use `Number()` or the `toNumber()` helper from `src/lib/utils.ts` before arithmetic or comparisons.

### Seed script is slow
The sensor seed creates ~17K rows. It batches `createMany` in chunks of 5,000 to stay under PostgreSQL's parameter limit. This is normal and should complete in under 30 seconds.
