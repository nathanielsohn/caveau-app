# Authentication

> Last updated: 2026-04-23 | NextAuth v4, JWT sessions, Credentials provider

## Overview

Caveau uses [NextAuth.js v4](https://next-auth.js.org/) with the Credentials provider. Sessions are JWTs, signed with `NEXTAUTH_SECRET` and stored in an httpOnly cookie. There is no refresh token — sessions expire after 1 hour absolute (`maxAge: 3600`) with a 15-minute sliding refresh (`updateAge: 900`), so an active user is not kicked mid-session but an idle tab goes cold quickly.

All application data is scoped to the authenticated member: every Prisma query in a Server Component, Server Action, or API route reads `getServerAuth()` and filters by `memberId`.

## Key files

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config (Credentials provider, JWT callbacks, `getServerAuth()` helper) |
| `src/middleware.ts` | Edge middleware: rate limits auth endpoints, redirects unauthenticated requests, sets CSP |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handler (login, CSRF, session, signout) |
| `src/app/api/auth/signup/route.ts` | Signup endpoint with CSRF double-submit + Zod validation |
| `src/app/auth/login/page.tsx` | Login form |
| `src/app/auth/signup/page.tsx` | Signup form |
| `src/components/providers.tsx` | `SessionProvider` wrapper for client components |
| `src/types/next-auth.d.ts` | Augments the session type with `id`, `role`, `tier`, `onboarded` |
| `src/lib/safe-callback.ts` | Validates `callbackUrl` to prevent open redirects |
| `src/app/onboarding/` | Guided 4-step wizard for new members (#20, #59) — wizard, server actions, minimal layout |

## Session shape

```ts
session.user = {
  id: string;       // Member.id (UUID)
  name: string;
  email: string;
  role: "admin" | "staff" | "member";
  tier: "gold" | "reserve" | "platinum" | "black";
  onboarded: boolean; // Member.onboardedAt != null
}
```

`role`, `tier`, and `onboarded` are copied into the JWT during the `jwt` callback and surfaced on the session via the `session` callback. RBAC guards are wired and the admin panel (#28) is live at `/admin/*`; middleware gates the route tree to `role === "admin"` with a layout-level re-check.

The `jwt` callback also handles `trigger === "update"`: when the onboarding wizard finishes it calls `useSession().update()`, which re-runs the callback and re-reads `tier` + `onboardedAt` from the DB so middleware sees the new state without forcing a re-login.

## Login flow

```mermaid
sequenceDiagram
    participant U as User
    participant LP as /auth/login
    participant NA as NextAuth /api/auth/callback/credentials
    participant MW as Middleware
    participant DB as PostgreSQL

    U->>LP: GET /auth/login
    LP-->>U: Form + CSRF token cookie
    U->>NA: POST email + password + csrfToken
    MW->>MW: Rate limit (10/60s per IP)
    NA->>NA: Verify CSRF (NextAuth built-in)
    NA->>DB: SELECT member WHERE email = lower(trim(input))
    DB-->>NA: Member row (incl. passwordHash)
    NA->>NA: bcrypt.compare(password, passwordHash)
    alt Password matches
        NA->>NA: Sign JWT { id, role, tier } — 1h absolute (15m sliding)
        NA-->>U: Set-Cookie: next-auth.session-token (httpOnly)
        NA-->>U: 302 → callbackUrl (validated) or /
    else Password mismatch / no member
        NA-->>U: 401 — generic "Invalid credentials"
    end
```

**Hardening notes**
- Email is lowercased and trimmed before lookup.
- bcrypt cost on signup hashing is 13 — high enough to slow down offline cracking, low enough to fit in the 5s serverless budget. Login uses `bcrypt.compare`, which has no cost parameter.
- The `callbackUrl` query param is validated by `safe-callback.ts` so it can only point to same-origin paths.

## Signup flow

```mermaid
sequenceDiagram
    participant U as User
    participant SP as /auth/signup
    participant API as POST /api/auth/signup
    participant MW as Middleware
    participant DB as PostgreSQL

    U->>SP: GET /auth/signup
    SP-->>U: Form + NextAuth CSRF cookie
    Note over SP: Form reads csrfToken cookie value<br/>and submits it in the body

    U->>API: POST { name, email, password, csrfToken }
    MW->>MW: Rate limit (5/60s per IP)
    API->>API: Read next-auth.csrf-token cookie
    API->>API: Split "<token>|<hash>"
    API->>API: timingSafeEqual(submitted, token)
    API->>API: sha256(token + NEXTAUTH_SECRET) == hash?
    alt CSRF fails
        API-->>U: 400 "Invalid request" (generic)
    else CSRF passes
        API->>API: Zod parse: name, email, password policy<br/>(min 12 chars, upper + lower + digit + symbol)
        alt Validation fails
            API-->>U: 400 (Zod errors)
        else Validation passes
            API->>DB: SELECT member WHERE email = ?
            alt Member exists
                API-->>U: 201 success (no enumeration)
            else New member
                API->>API: bcrypt.hash(password, 13)
                API->>DB: INSERT member (role=member, tier=gold, onboardedAt=null)
                API-->>U: 201 success
            end
        end
    end
    SP->>NA: signIn("credentials", { email, password })
    NA-->>SP: Set session cookie (onboarded=false)
    SP->>U: router.push("/onboarding")
```

**Why the double-submit CSRF check**
NextAuth's CSRF cookie is a `<token>|<hash>` pair where `hash = sha256(token + NEXTAUTH_SECRET)`. By requiring the client to echo the token back in the request body and verifying both halves, we prove the request originated from a page that read our cookie — a cross-origin attacker cannot read the cookie value, so they cannot forge a valid body.

**Why 201 for both new and existing accounts**
Returning `409 Conflict` for an existing email would let an attacker enumerate which addresses are registered. The bcrypt cost difference is a small timing side channel we accept for now.

## Route protection

```mermaid
flowchart TD
    R[Incoming request] --> RL{Matches a<br/>rate-limit policy?}
    RL -->|Yes — over limit| TL[429 Too Many Requests]
    RL -->|Yes — under limit| PB{Public path?}
    RL -->|No| PB
    PB -->|/auth/*<br/>/verify/*<br/>/bottle/*<br/>/handoff/*<br/>/handoff-driver/*<br/>/waitlist<br/>/api/auth/*<br/>/api/health<br/>/api/ingest/sensor<br/>/api/ses/webhook<br/>/api/cron/*<br/>/api/deliveries/by-token/*| OK[Forward + CSP]
    PB -->|Anything else| TK{JWT cookie<br/>present + valid?}
    TK -->|No| RD[302 → /auth/login<br/>?callbackUrl=validated]
    TK -->|Yes| OB{token.onboarded?}
    OB -->|false + path != /onboarding| ROD[302 → /onboarding]
    OB -->|true + path == /onboarding| RDH[302 → /]
    OB -->|otherwise| OK2[Forward + CSP]
```

Public paths bypass auth entirely. The public tree has grown since the original demo — NFC tap-to-verify at `/bottle/:tagId` (#43), auction-broker handoff at `/handoff/:token` (#41), delivery driver portal at `/handoff-driver/:token` (#51), the founding-member waitlist page and POST endpoint (#49), the public Sentinel ingest route (#21, guarded by `SENTINEL_INGEST_SECRET` bearer instead of session), the SES bounce/complaint webhook (#19, SNS-signed), cron endpoints (`/api/cron/*`, guarded by `CRON_SECRET` bearer), and the delivery by-token API for drivers (`/api/deliveries/by-token/*`). Everything else — including `/report/*` and the legacy `/certificate/*` redirect — requires a valid session cookie. The report **page** then performs an ownership check (`session.user.id == certificate.wine.memberId`) before rendering, and the `/api/certificates/[id]` route applies the same guard. Admin routes (`/admin/*`) additionally require `role === "admin"` in middleware with a layout-level re-check.

The onboarding gate runs after the auth check: members whose `onboardedAt` is null are pinned to `/onboarding` until the wizard finishes, and members who have already finished are redirected away if they revisit the wizard URL. This is enforced in middleware against the JWT, not against the database, so the gate is effectively free per request.

## Onboarding wizard (#20)

After signup the client auto-signs in and pushes the new member to `/onboarding`. The wizard is a single client component (`src/app/onboarding/wizard.tsx`) that drives four steps via local state:

1. **Tier** — pick gold / reserve / platinum / black (display-labelled Collector / Reserve / Private Vault / Estate). `setOnboardingTier(tier)` server action persists the choice. The signup endpoint defaults new members to gold so this step is a re-confirmation, not a hard requirement.
2. **Locker reservation** — `reserveOnboardingLocker()` allocates the next free `locker_number`, creates the row in the demo facility, and creates 32 `LockerSlot` rows in a single Prisma call. Idempotent: a member who already owns a locker gets that one returned. Number collisions under contention bubble up as Prisma `P2002` and the action retries with a bumped number (up to three attempts).
3. **Sentinel devices (#59)** — for bundle tiers (Reserve / Private Vault / Estate) `assignOnboardingSentinels()` consumes the oldest pool units at the member's facility and transactionally flips them to installed in step 2's reserved locker with a demo-alive heartbeat (connectivity=wifi, batteryPct=100, lastHeartbeatAt=now). Shortage soft-fails with "N shipping this week" copy. Collector is an upsell panel with no server action.
4. **First bottle** — optional. `addFirstWine(formData)` validates the inputs, creates a `Wine`, and assigns it to the first empty slot of the reserved locker inside a single transaction. The user can also skip the bottle and finish.

Both terminal paths call `completeOnboarding()`, which sets `members.onboarded_at = NOW()`. The client then calls `useSession().update()`. That triggers the `jwt` callback with `trigger === "update"`, which re-reads the member row and refreshes `token.onboarded` → middleware lets the member into `/`.

**Resume support** — the page server component reads the member row before rendering. If a previous attempt already reserved a locker, the wizard mounts at step 3 (devices) instead of step 1 so the user doesn't have to pick a tier or re-reserve a locker after a refresh.

```mermaid
sequenceDiagram
    participant U as User
    participant W as /onboarding wizard
    participant SA as Server actions
    participant DB as PostgreSQL
    participant JWT as JWT callback

    U->>W: Land after signup auto sign-in
    W->>SA: setOnboardingTier(gold|reserve|platinum|black)
    SA->>DB: UPDATE members SET tier
    W->>SA: reserveOnboardingLocker()
    SA->>DB: INSERT locker + 32 slots (idempotent)
    SA-->>W: { lockerNumber, zone }
    W->>SA: assignOnboardingSentinels() (bundle tiers only)
    SA->>DB: UPDATE tier-bundled devices → installed
    W->>SA: addFirstWine(form) OR skip
    SA->>DB: INSERT wine + assign to slot 1 (txn)
    W->>SA: completeOnboarding()
    SA->>DB: UPDATE members SET onboarded_at = NOW()
    W->>JWT: useSession().update()
    JWT->>DB: SELECT tier, onboarded_at WHERE id = ?
    JWT-->>W: token.onboarded = true
    W->>U: router.push("/")
```

## Rate-limit policies

| Bucket | Trigger | Limit |
|--------|---------|-------|
| `auth-signup` | `POST /api/auth/signup` | 5 / 60s per IP (fail-closed) |
| `auth-login` | `POST /api/auth/callback/*` | 10 / 60s per IP (fail-closed) |
| `verify` | Any `/verify/*` request | 20 / 60s per IP |
| `sensors-history` | `GET /api/sensors/history` | 30 / 60s per IP |
| `handoff` | Any `/handoff/*` request (#41) | 30 / 60s per IP |
| `handoff-driver` | Any `/handoff-driver/*` request (#51) | 30 / 60s per IP |
| `bottle-tap` | Any `/bottle/*` request (#43) | 30 / 60s per IP |
| `waitlist-submit` | `POST /waitlist` (#49) | 5 / 60s per IP |

Limiter backend is Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set; otherwise `src/lib/rate-limit.ts` falls back to per-Lambda in-memory tracking that resets on cold start (adequate for dev, not a real ceiling in prod). Signup and login are configured `failMode: "closed"` — if Upstash is unreachable we reject rather than silently disable brute-force protection.

## Server-side vs client-side access

- **Server Components, Server Actions, Route Handlers** — call `getServerAuth()` from `src/lib/auth.ts`. Always check the result is non-null before querying user data.
- **Client Components** — call `useSession()` from `next-auth/react`. The whole tree is wrapped in `<SessionProvider>` via `components/providers.tsx`.

## Demo credentials

When enabled, the login page surfaces:

```
robert@caveau.com / demo1234
```

This block is gated by `process.env.NEXT_PUBLIC_SHOW_DEMO_CREDS === "true"`, which is bundled at build time so the check strips to a constant in production bundles when the flag is unset. Leave the env var unset in production deployments; set it to `"true"` in dev or staging builds where demo credentials should be visible.

## Known gaps

- No email verification on signup — the address is trusted as soon as it parses.
- No password reset flow.
- No account lockout after N failed login attempts (rate limit is per IP, not per account).
- When Upstash is not configured the rate limiter falls back to per-Lambda memory; an attacker can spread attempts across cold starts. Wire Upstash in prod.
- Role downgrades (admin → member) invalidate existing sessions by bumping `Member.sessionVersion` (migration 0020), checked in the `jwt` callback. Role upgrades still require a relogin until the sliding-refresh window repulls the row.
