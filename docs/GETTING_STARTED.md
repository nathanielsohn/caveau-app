# Getting Started

> Last updated: 2026-04-13 | 14 core + 3 stretch features complete; 14 of 24 roadmap features done

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

Edit `.env` with your database connection and auth secrets:
```
DATABASE_URL=postgresql://username:password@host:5432/caveau
NEXTAUTH_SECRET=your-secret-here   # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Optional — enable alert emails (feature #19) via AWS SES.
# If AWS_SES_FROM_EMAIL is unset, the app logs + no-ops instead of calling SES.
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=alerts@caveau.com

# Optional — enable wine bottle photo uploads (feature #18) to S3.
# If AWS_S3_BUCKET is unset, the upload UI shows a friendly "disabled" state.
# AWS_CLOUDFRONT_DOMAIN is optional; when set, public image URLs route through the CDN.
AWS_S3_BUCKET=caveau-wine-images
AWS_CLOUDFRONT_DOMAIN=d111111abcdef8.cloudfront.net
```

### 3. Set up database

```bash
# Generate Prisma client (TypeScript types from schema)
npx prisma generate

# Run migrations (creates tables) — requires DATABASE_URL
npx prisma migrate deploy

# Seed demo data (wines, lockers, members, sensors, alerts)
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
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` (no compile, types only) |
| `npm test` | Run tests in watch mode (Vitest) |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run ci` | Lint + typecheck + tests (mirror of GitHub Actions) |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:migrate` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Run seed scripts (`prisma db seed`) |
| `npx prisma migrate dev --name <name>` | Create a new migration in development |
| `npx prisma studio` | Open Prisma Studio (visual DB browser) |

## Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full directory tree and data flow diagrams.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | App base URL (`http://localhost:3000` for dev) |
| `AWS_REGION` | No | AWS region for SES + S3 clients |
| `AWS_SES_FROM_EMAIL` | No | Enables alert emails (#19). No-op when unset. |
| `AWS_S3_BUCKET` | No | Enables wine image upload (#18). UI shows disabled state when unset. |
| `AWS_CLOUDFRONT_DOMAIN` | No | Routes image URLs through CloudFront instead of S3. |

## Common Issues

### "Cannot find module '@prisma/client'"
Run `npx prisma generate` — the client is generated from the schema, not included in node_modules by default.

### "P1001: Can't reach database server"
Check that your DATABASE_URL is correct and the database is accessible. For RDS, ensure your IP is in the security group's inbound rules.

### "Decimal" type errors in components
Prisma returns `Decimal` fields as objects, not numbers. Use `Number()` or the `toNumber()` helper from `src/lib/utils.ts` before arithmetic or comparisons.

### Seed script is slow
The sensor seed creates ~17K rows. It batches `createMany` in chunks of 5,000 to stay under PostgreSQL's parameter limit. This is normal and should complete in under 30 seconds.
