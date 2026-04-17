# Deployment

> Last updated: 2026-04-13 | 14 core + 3 stretch features complete; 15 of 24 roadmap features done

## Infrastructure

```mermaid
flowchart LR
    subgraph Local
        Dev[Developer Machine\nnpm run dev]
    end

    subgraph GitHub
        Repo[caveau-app repo\nmain branch]
    end

    subgraph Vercel
        CDN[CDN / Edge Network]
        SF[Serverless Functions\nNext.js API + SSR]
    end

    subgraph AWS
        RDS[(RDS PostgreSQL 15\ndb.t3.micro — free tier)]
    end

    Dev -->|git push| Repo
    Repo -->|auto-deploy on push| CDN
    CDN --> SF
    SF -->|Prisma| RDS
    Dev -->|Prisma direct\nlocal dev| RDS
```

| Service | Purpose | Tier |
|---------|---------|------|
| AWS RDS (PostgreSQL 15) | Database | Free tier: db.t3.micro, 20GB |
| Vercel | Hosting + CDN | Free tier: 100GB bandwidth, serverless functions |
| GitHub | Source control | Free |

## RDS Setup

### 1. Create the database instance

1. AWS Console → RDS → Create database
2. Engine: **PostgreSQL 15**
3. Template: **Free tier** (db.t3.micro, 20GB gp2)
4. DB instance identifier: `caveau-db`
5. Master username/password: your choice
6. **Public access: Yes** (required for local dev + Vercel)
7. Create database name: `caveau`

### 2. Configure security group

Add inbound rules for port **5432 (PostgreSQL)**:

| Source | Purpose |
|--------|---------|
| Your IP (e.g., `73.x.x.x/32`) | Local development |

**Do NOT use `0.0.0.0/0`** — it exposes the database to the entire internet.

**Note on Vercel access:** Vercel serverless functions use dynamic IPs that change per invocation. For the demo/early production phase, RDS public access with strong credentials and SSL is sufficient. For hardened production, consider RDS Proxy or a VPN.

### 3. Get connection string

Copy the RDS endpoint from the console. Your `DATABASE_URL` will be:
```
postgresql://<username>:<password>@<endpoint>.rds.amazonaws.com:5432/caveau
```

### 4. Initialize the database

```bash
# Push schema to RDS
npx prisma migrate deploy

# Seed demo data
npx prisma db seed
```

## Vercel Setup

### 1. Connect repository

1. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Select the `caveau-app` repository
3. Vercel auto-detects Next.js — zero configuration needed

### 2. Configure environment variables

Add in Vercel Dashboard → Settings → Environment Variables. **Only two vars are required** — `src/lib/env.ts` throws at boot if either is missing:

| Key | Required | Value |
|-----|----------|-------|
| `DATABASE_URL` | Yes | Your RDS connection string |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | No | Public app URL (e.g. `https://caveau.vercel.app`). Vercel sets `VERCEL_URL` automatically; NextAuth falls back to it if `NEXTAUTH_URL` is unset. Set it explicitly when you attach a custom domain. |
| `NEXT_PUBLIC_SHOW_DEMO_CREDS` | No | When `"true"`, the login page renders the `robert@caveau.com / demo1234` block. Leave unset in production. |
| `CERTIFICATE_HMAC_SECRET` | No | Independent HMAC key for Caveau Custody & Condition Report hashes (`src/lib/certificate-hash.ts`). Falls back to `NEXTAUTH_SECRET` if unset — fine for the demo; set a dedicated random value in real production so a leak of one secret doesn't compromise the other. |
| `FACILITY_COOKIE_SECRET` | No | Independent HMAC key for the signed facility-switcher cookie (`src/lib/current-facility.ts`). Same fallback story as above. |
| `UPSTASH_REDIS_REST_URL` | No | Enables distributed rate limiting. Without it, `src/lib/rate-limit.ts` uses the per-Lambda in-memory limiter, which resets on cold start. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Companion token for Upstash Redis. Both must be set for the Redis limiter to activate. |
| `AWS_REGION` | No | AWS region for SES + S3 clients (e.g. `us-east-1`) |
| `AWS_SES_FROM_EMAIL` | No | Enables feature #19 alert emails. If unset, the app logs + no-ops instead of calling SES. |
| `AWS_S3_BUCKET` | No | Enables feature #18 wine image upload. If unset, the upload UI shows a friendly "disabled" state and the rest of the app keeps working. |
| `AWS_CLOUDFRONT_DOMAIN` | No | When set, public image URLs go through the CDN instead of S3 directly. |
| `GOOGLE_CLOUD_VISION_API_KEY` | No | Enables wine label OCR (feature #24). If unset, the Scan Label button renders disabled with a tooltip. Restrict the key to the Vision API only in Google Cloud Console. |

The AWS, Google, and Upstash vars degrade gracefully — the app boots and runs without them, features #18 / #19 / #24 and distributed rate limiting just become no-ops or disabled UI.

### 3. Deploy

Push to `main` → Vercel auto-deploys. Preview deployments are created for every PR.

### 4. Custom domain (optional)

Add via Vercel Dashboard → Settings → Domains.

## Security Middleware

The app's `src/middleware.ts` applies security controls to every request:

- **Auth protection**: all routes require a valid JWT token, with these exceptions: `/auth/*` (login, signup), `/verify/*` (public certificate verification), `/api/auth/*` (NextAuth handlers), and `/api/health` (uptime probe). `/certificate/*` pages are auth-protected and the page enforces an ownership check before rendering.
- **Rate limiting** (per-IP, in-memory): `POST /api/auth/signup` 5/60s, `POST /api/auth/callback/*` 10/60s, `/verify/*` 20/60s, `GET /api/sensors/history` 30/60s. The limiter resets on deploy and doesn't persist across serverless instances. For production hardening, migrate to Upstash Redis or Vercel KV.
- **CSP headers**: Content-Security-Policy is built per-request. Production uses `'unsafe-inline'` for scripts due to Next.js App Router limitations (inline scripts without nonce support).
- **Static security headers** (in `next.config.mjs`): HSTS (2 years + preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Permissions-Policy (no camera/mic/geo), X-Permitted-Cross-Domain-Policies none.

## Troubleshooting

### Build fails with Prisma errors
Ensure `prisma generate` runs during the build. Add a `postinstall` script to package.json:
```json
"postinstall": "prisma generate"
```

### Database connection timeouts
The Prisma client singleton in `src/lib/prisma.ts` prevents re-initialization on warm serverless invocations. If you see connection exhaustion under load, consider adding RDS Proxy (~$22/mo) for connection pooling.

### Slow cold starts
Vercel serverless functions can have cold starts on first request. Subsequent requests reuse the warm function and existing database connection.
