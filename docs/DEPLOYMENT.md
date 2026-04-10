# Deployment

> Last updated: 2026-04-10 18:52 | Feature 01 — Project Scaffold

## Infrastructure

| Service | Purpose | Tier |
|---------|---------|------|
| AWS RDS (PostgreSQL 15) | Database | Free tier: db.t3.micro, 20GB |
| AWS Amplify | Hosting + CDN | Free tier: 1000 build mins, 15GB, 500K req/mo |
| GitHub | Source control | Free |

## RDS Setup

### 1. Create the database instance

1. AWS Console → RDS → Create database
2. Engine: **PostgreSQL 15**
3. Template: **Free tier** (db.t3.micro, 20GB gp2)
4. DB instance identifier: `caveau-db`
5. Master username/password: your choice
6. **Public access: Yes** (required for local dev + Amplify)
7. Create database name: `caveau`

### 2. Configure security group

Add inbound rules for port **5432 (PostgreSQL)**:

| Source | Purpose |
|--------|---------|
| Your IP (e.g., `73.x.x.x/32`) | Local development |
| Amplify NAT gateway IPs | Production access |

**Do NOT use `0.0.0.0/0`** — it exposes the database to the entire internet.

**Note on Amplify IPs:** This is a chicken-and-egg problem. You won't know Amplify's NAT gateway IPs until after the first deploy. The first deploy will fail to connect to RDS. After deploying, find the NAT gateway IPs in the VPC console and add them to the security group, then redeploy.

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

## AWS Amplify Setup

### 1. Connect repository

1. AWS Amplify Console → New App → GitHub
2. Select the `caveau-app` repository and `main` branch
3. Amplify auto-detects Next.js

### 2. Configure environment variables

Add in Amplify Console → Environment Variables:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your RDS connection string |

### 3. Build configuration

If the auto-detected build settings don't work, create an `amplify.yml` in the project root:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npx prisma generate
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

### 4. Deploy

Push to `main` → Amplify auto-deploys.

### 5. Custom domain (optional)

Add via Amplify Console → Domain Management, or use Route 53 for DNS.

## Troubleshooting

### First deploy fails with database connection error
Expected. See "Note on Amplify IPs" above — add the NAT gateway IPs to RDS security group, then redeploy.

### Build fails with Prisma errors
Ensure `npx prisma generate` runs in the preBuild or build phase before `npm run build`.

### Slow cold starts
Next.js on Amplify can have cold starts for SSR pages. The Prisma client singleton in `src/lib/prisma.ts` prevents re-initialization on warm invocations.
