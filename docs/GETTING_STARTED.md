# Getting Started

> Last updated: 2026-04-13 | 14 core + 3 stretch features complete; 15 of 24 roadmap features done

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
# Required — src/lib/env.ts throws at boot if these are missing.
DATABASE_URL=postgresql://username:password@host:5432/caveau
NEXTAUTH_SECRET=your-secret-here   # openssl rand -base64 32

# Optional — NextAuth falls back to the request host / VERCEL_URL when
# unset. Set it explicitly for local dev or when attaching a custom domain.
NEXTAUTH_URL=http://localhost:3000

# Optional — when "true", the login page shows the demo credentials block.
# Leave unset in production builds.
NEXT_PUBLIC_SHOW_DEMO_CREDS=true

# Optional — dedicated HMAC keys for provenance certificate hashes and the
# signed facility-switcher cookie. Both fall back to NEXTAUTH_SECRET when
# unset (fine for demo/dev); set independent random values in production
# so a leak of one secret doesn't compromise the others.
CERTIFICATE_HMAC_SECRET=
FACILITY_COOKIE_SECRET=

# Optional — distributed rate limiting via Upstash Redis. If either var is
# unset, src/lib/rate-limit.ts falls back to the per-Lambda in-memory limiter
# (fine for dev, not a real ceiling in prod because each cold start resets
# the counter).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Optional — enable alert emails (feature #19) via AWS SES.
# If AWS_SES_FROM_EMAIL is unset, the app logs + no-ops instead of calling SES.
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=alerts@caveau.com

# Optional — enable wine bottle photo uploads (feature #18) to S3.
# If AWS_S3_BUCKET is unset, the upload UI shows a friendly "disabled" state.
# AWS_CLOUDFRONT_DOMAIN is optional; when set, public image URLs route through the CDN.
AWS_S3_BUCKET=caveau-wine-images
AWS_CLOUDFRONT_DOMAIN=d111111abcdef8.cloudfront.net

# Optional — enables wine label OCR (feature #24) via Google Cloud Vision.
# If GOOGLE_CLOUD_VISION_API_KEY is unset, the Scan Label button renders
# disabled with a tooltip. Restrict the key to the Vision API only in
# Google Cloud Console.
GOOGLE_CLOUD_VISION_API_KEY=AIzaSy...
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
| `NEXTAUTH_URL` | No | App base URL. Set for local dev (`http://localhost:3000`) or when attaching a custom domain; NextAuth falls back to the request host / `VERCEL_URL` otherwise. |
| `NEXT_PUBLIC_SHOW_DEMO_CREDS` | No | When `"true"`, the login page surfaces the demo credentials block. Leave unset in production. |
| `CERTIFICATE_HMAC_SECRET` | No | Dedicated HMAC key for provenance certificate hashes. Falls back to `NEXTAUTH_SECRET`. |
| `FACILITY_COOKIE_SECRET` | No | Dedicated HMAC key for the signed facility-switcher cookie. Falls back to `NEXTAUTH_SECRET`. |
| `UPSTASH_REDIS_REST_URL` | No | Enables distributed rate limiting; in-memory limiter is used when unset. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Companion token for Upstash Redis. |
| `AWS_REGION` | No | AWS region for SES + S3 clients |
| `AWS_SES_FROM_EMAIL` | No | Enables alert emails (#19). No-op when unset. |
| `AWS_S3_BUCKET` | No | Enables wine image upload (#18). UI shows disabled state when unset. |
| `AWS_CLOUDFRONT_DOMAIN` | No | Routes image URLs through CloudFront instead of S3. |
| `GOOGLE_CLOUD_VISION_API_KEY` | No | Enables wine label OCR (#24). Scan Label button renders disabled when unset. |

## Common Issues

### "Cannot find module '@prisma/client'"
Run `npx prisma generate` — the client is generated from the schema, not included in node_modules by default.

### "P1001: Can't reach database server"
Check that your DATABASE_URL is correct and the database is accessible. For RDS, ensure your IP is in the security group's inbound rules.

### "Decimal" type errors in components
Prisma returns `Decimal` fields as objects, not numbers. Use `Number()` or the `toNumber()` helper from `src/lib/utils.ts` before arithmetic or comparisons.

### Seed script is slow
The sensor seed creates ~17K rows. It batches `createMany` in chunks of 5,000 to stay under PostgreSQL's parameter limit. This is normal and should complete in under 30 seconds.
