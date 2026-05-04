# Architecture Decision Records

> Decisions that shaped Caveau's technical direction. Each entry explains what we chose, what we considered, and why.

---

## ADR-001: RDS + Prisma over Supabase

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Needed a database for the MVP. Options were Supabase (hosted Postgres + auth + REST API) or AWS RDS (managed Postgres) with Prisma ORM.

**Decision:** RDS + Prisma.

**Why at the time:**
- Database stays on AWS alongside future backend services (IoT ingestion, background jobs)
- RDS free tier is generous (12 months, db.t3.micro, 20GB)
- Prisma provides type-safe queries and auto-generated TypeScript types from the schema
- No vendor lock-in — standard Postgres, can migrate anywhere
- Supabase auth/REST features were not needed for the initial demo; Caveau now uses NextAuth.js directly.

**Trade-offs:**
- More manual setup than Supabase (security groups, connection strings)
- No built-in auth — required a separate auth layer, now implemented with NextAuth.js

---

## ADR-002: Next.js App Router Version

**Date:** 2026-04-10
**Status:** Superseded by upgrade to Next.js 15

**Context:** Next.js 15 was available but brought breaking changes and newer patterns.

**Original decision:** Pin to Next.js 14 via `create-next-app@14`.

**Current state:** The app now runs on Next.js 15 (`package.json`), still using the App Router and the same conservative Server Component / Server Action patterns.

**Why at the time:**
- Next.js 14 App Router is stable and well-documented
- Wider ecosystem compatibility (tutorials, Stack Overflow answers, library support)
- "Tried-and-true tech only" principle — no bleeding-edge patterns for a demo
- One developer maintains this — stability over novelty

---

## ADR-003: Prisma 5 (not 7)

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Prisma 7 was the latest version but introduced breaking changes to configuration (moved `url` out of `schema.prisma`, requires `prisma.config.ts`).

**Decision:** Pin to Prisma 5.x.

**Why:**
- Prisma 5 remains the app's pinned ORM while the framework runs on Next.js 15.
- Traditional `schema.prisma` with `url = env("DATABASE_URL")` — simpler, well-documented
- No need for Prisma 7's new features (Prisma Accelerate, etc.) in a demo app
- Avoids configuration complexity for a project maintained by one developer

---

## ADR-004: Recharts over alternatives

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Needed charting for the Sentinel IoT dashboard. Options: Recharts, Chart.js (via react-chartjs-2), Nivo, Victory, Tremor.

**Decision:** Recharts v2.

**Why:**
- Most popular React charting library — huge community, well-documented
- Declarative API that composes naturally with React components
- Good dark theme support via custom styling
- Lightweight enough for 4 chart types (area, line, bar/radial, status)

---

## ADR-005: Client-side sensor simulation

**Date:** 2026-04-10
**Status:** Accepted

**Context:** The demo needs "live" sensor data but has no real IoT devices.

**Decision:** Client-side simulation via `setInterval` every 5 seconds using deterministic formulas with random noise.

**Why:**
- No server load or database writes for live data
- Realistic-looking data (sine wave for diurnal temperature cycles + gaussian noise)
- Threshold checking runs client-side — live alerts appear instantly
- Historical data (30 days) is pre-seeded in the database for time-range queries

**Formula:**
```
temp = 55.0 + sin((hour - 5) × π/12) + gaussian(0, 0.1)
humidity = 65.0 - (temp - 55.0) × 2.0 + gaussian(0, 0.3)
vibration = 0.1 + spike_or_noise
light = rare_spike_or_near_zero
```

---

## ADR-006: Colocated sub-components

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Standard React practice is one component per file. With ~20 source files total, this keeps things compact.

**Decision:** Related sub-components live in the same file as their parent.

**Why:**
- "Keep it simple" and "one developer maintains this" principles
- Fewer files to navigate, less import boilerplate
- Sub-components are tightly coupled to their parent anyway
- Example: `sensor-charts.tsx` contains TemperatureChart, HumidityChart, VibrationGauge, and AccessLog

---

## ADR-007: Server Actions for internal data, REST for external

**Date:** 2026-04-10
**Status:** Accepted (REST surface added 2026-04-11 with roadmap #17)

**Context:** Client components (like Sentinel) need to fetch data from the database. Options: Next.js API routes (`/api/...`) or Server Actions.

**Decision:** Server Actions for in-app data flow, REST API routes (`/api/*`) as a parallel surface for mobile/external consumers.

**Why:**
- Server Actions keep the in-app path type-safe end-to-end (TypeScript function call, not HTTP) and avoid REST boilerplate for internal use
- REST routes are required for anything that lives outside the Next.js bundle (mobile app, integrations) — these were added in roadmap #17
- Both surfaces share the same Prisma queries and Zod schemas, so behavior stays consistent regardless of caller
- Auth scoping is enforced uniformly: server actions read `getServerAuth()`, API routes call it inside the handler

---

## ADR-008: Vercel over AWS Amplify

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Needed a hosting platform for the Next.js app. Options were AWS Amplify (keeps everything on AWS) or Vercel (the canonical Next.js host).

**Decision:** Vercel.

**Why:**
- Vercel is built by the Next.js team — zero-config, best-in-class Next.js support
- Massive community documentation and training data coverage (important for AI-assisted development)
- AWS Amplify's Next.js SSR support has been a moving target with sparse community content
- Free tier is generous (100GB bandwidth, serverless functions, edge middleware)
- Database stays on AWS RDS — Vercel + RDS is a well-documented, common pattern

**Trade-offs:**
- Hosting and database are on different providers (Vercel + AWS) — not single-cloud
- Vercel serverless functions use dynamic IPs, complicating RDS security group rules
- Future backend workloads (IoT ingestion, background jobs) will live on AWS separately

---

## ADR-009: Kill the wine marketplace (#33)

**Date:** 2026-04-14
**Status:** Accepted

**Context:** Original roadmap included feature #33, a member-to-member wine marketplace. The April 2026 investor review with Robert Saenz reframed Caveau's positioning around being the software layer of a trusted private vault operator, with chain-of-custody and provenance as the core differentiator.

**Decision:** Deprioritize #33 indefinitely. Revisit post-pilot only.

**Why:**
- A marketplace dilutes the "custodian" framing the rest of the product depends on. A vault operator that trades the inventory it stores is closer to a broker than a bank.
- Auction / broker handoff (#41) covers the "I want to sell" use case with a more credible positioning — Caveau prepares the member for a Christie's / Sotheby's / Acker consignment rather than running a trading venue.
- Compliance footprint (state-by-state alcohol shipping, marketplace operator obligations) is enormous relative to revenue upside in the seed-round window.

**Trade-offs:**
- Gives up a potential network-effect moat against CellarTracker / Vivino
- Members who want to sell peer-to-peer will route around Caveau — acceptable because exit facilitation (#47) channels them into the auction-house flow

---

## ADR-010: "Caveau Custody & Condition Report" (CCR) terminology

**Date:** 2026-04-16
**Status:** Accepted

**Context:** The document attached to each bottle had multiple names across the codebase and business docs: "certificate", "provenance certificate", "Caveau certificate". Robert's April 2026 business docs settled on "Caveau Custody & Condition Report" to align with how auction houses and insurers think about the document's role.

**Decision:** Rename to **Caveau Custody & Condition Report** (abbreviated **CCR**) everywhere user-facing. Keep the Prisma model name `ProvenanceCertificate` and the HMAC secret `CERTIFICATE_HMAC_SECRET` — code-level renames would be churn without business value. Route `/certificate/[id]` → legacy redirect to `/report/[id]`.

**Why:**
- Matches the language auction houses, insurers, and estate planners use in the vault-custodian framing.
- "Report" (not "certificate") signals a continuously-updated, time-bounded document — correct for a chain-of-custody artifact that accumulates new sensor data.
- AI Advisor and all member-facing UI use CCR consistently (see `feedback_advisor_scope.md` memory + `AI-ADVISOR-SPEC.md` terminology discipline section).

**Trade-offs:**
- Codebase drift between user-facing term (CCR) and internal model name (`ProvenanceCertificate`). Documented, accepted.

---

## ADR-011: NFC bottle tracking over QR codes

**Date:** 2026-04-16
**Status:** Accepted

**Context:** Need per-bottle identity tracking for tap-to-verify at auction houses, insurers, and member homes. Options: QR stickers, NFC tags, RFID.

**Decision:** NFC tags in two tiers — invisible capsule under foil for trophy bottles ($1,000+), branded navy/gold neck collar for standard bottles. No QR stickers anywhere.

**Why:**
- Auction houses notice post-production label modification. A QR sticker is a red flag at Christie's. A tag under the capsule foil is invisible and non-destructive.
- NFC taps work from any modern phone without an app install. QR requires camera + deliberate framing; NFC is one second of proximity.
- Tier-based visibility lets the branded collar double as packaging for standard bottles while preserving the collector aesthetic on trophy bottles.

**Trade-offs:**
- NFC tag unit cost > QR sticker cost (~$0.50 vs. $0.001). Acceptable — average bottle value makes the math trivial.
- Requires `/bottle/[tagId]` public page and NFC tag data model (#43). Landed in migration `0016_nfc_tracking.sql`.

---

## ADR-012: AI Advisor as dual-role investment advisor + sommelier

**Date:** 2026-04-17
**Status:** Accepted (supersedes the institutional-only scope framing in the original AI-ADVISOR-SPEC.md)

**Context:** Phase 6 #50 AI Advisor was initially scoped to investment-advisor questions only — the four canonical pitch-deck questions (exit opportunity, Liv-ex 100 benchmark, alert interpretation, insurance estimate). First implementation exposed that members also ask sommelier-grade questions ("what should I open with ribeye tonight?") and a "can't help with that" response felt broken.

**Decision:** Expand advisor persona to dual-role: investment advisor (tool-grounded, hallucination-intolerant on prices/CAGR/alerts/CCRs) + sommelier (training-grounded on pairings/serving/decant, anchored to bottles the member actually owns via `getMemberPortfolio`).

**Why:**
- Members experience Caveau as one relationship, not two. A bifurcated advisor shipping them to "ask a sommelier elsewhere" undermines the trusted-guide framing.
- Sommelier questions naturally route through the portfolio tool (recommendations must name bottles the member owns), which keeps the answer grounded even when it draws on wine training.
- Speculative market calls stay off-limits — the refusal boundary is "don't invent facts", not "don't answer pairing questions".

**Trade-offs:**
- Wider surface area for hallucination. Mitigated by the "must name a bottle the member actually owns" rule for pairing recommendations.
- Requires a Q5 canonical acceptance test (the ribeye question) alongside the four original. Added to `AI-ADVISOR-SPEC.md`.

---

## ADR-013: Deliver Now — biometric ladder as a web-only flow (#51)

**Date:** 2026-04-17
**Status:** Accepted (in progress — data model and ladders live; OTP step-up + FL DABT ID-match pending)

**Context:** Phase 6 #51 Deliver Now promises pitch-deck slide 7's 4+4 verification ladder: app-side biometric → PIN → address → OTP, and door-side ID scan → name match → authorized recipient → photo log. Native apps would be the obvious choice for biometric re-auth, but Caveau has no mobile app yet (#29 deferred).

**Decision:** Build Deliver Now as two web surfaces — `/deliveries/[id]` for the member-side ladder (WebAuthn platform authenticator for biometric re-auth), `/handoff-driver/[token]` for the driver-side ladder with a tokenized URL. No native app required.

**Why:**
- WebAuthn platform authenticators (Face ID / Touch ID via Safari on iOS) satisfy the biometric-reauth step without shipping a native binary.
- A tokenized driver URL means any driver's phone is the hardware — no allocation, no app installs, no device management.
- Ships in weeks, not quarters. The mobile app (#29) remains deferred until payments (#27) land.

**Trade-offs:**
- WebAuthn UX is fussier than a native `SecKey` prompt. Acceptable for the investor-demo surface area.
- Driver portal is phishable if a driver's phone is compromised — compensating control is the photo + timestamp log and the 256-bit token entropy.

---

## ADR-014: Upstash Redis for rate limiting

**Date:** 2026-04-12 (initial), 2026-04-18 (confirmed)
**Status:** Accepted

**Context:** The original rate limiter was a per-Lambda in-memory token bucket. Acceptable for the demo but every cold start resets the counter, so a distributed attacker could drive effective request rates much higher than the documented limits.

**Decision:** Upstash Redis (REST API, not TCP) for production rate limiting, with the in-memory limiter as a graceful fallback when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are unset.

**Why:**
- REST API works natively from Vercel Edge without connection pooling pain.
- Pay-per-request pricing is negligible at the current traffic levels.
- Signup and login are configured `failMode: "closed"` — if Upstash is unreachable we reject rather than silently disable protection.

**Trade-offs:**
- One more production dependency. Mitigated by the in-memory fallback keeping dev/test unaffected.
