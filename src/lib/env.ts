/**
 * Boot-time environment validation.
 *
 * Importing this module asserts that every required env var is present and
 * shaped correctly. The exported `env` object is the only sanctioned way to
 * read these values — never reference `process.env.NEXTAUTH_SECRET` directly
 * elsewhere, because there's no compile-time check that it's set.
 *
 * Optional vars surface as `string | undefined` so call sites have to handle
 * the missing case explicitly.
 */

type RequiredKey = "DATABASE_URL" | "NEXTAUTH_SECRET";
type OptionalKey =
  | "NEXTAUTH_URL"
  | "SENTRY_DSN"
  | "UPSTASH_REDIS_REST_URL"
  | "UPSTASH_REDIS_REST_TOKEN"
  | "NEXT_PUBLIC_SHOW_DEMO_CREDS"
  // Mobile companion app (feature #29). MOBILE_TOKEN_SECRET signs the
  // bearer tokens returned by /api/mobile/login. It falls back to
  // NEXTAUTH_SECRET for dev/demo, but production should set an
  // independent random value so a leak of one secret doesn't compromise
  // the other.
  | "MOBILE_TOKEN_SECRET"
  // Token TTL in seconds. Optional; defaults to 30 days.
  | "MOBILE_TOKEN_TTL_SECONDS"
  // Expo push notifications (feature #29). When unset or not "true",
  // push sending is disabled and /api/mobile/push/* returns a friendly
  // 503. EXPO_PUSH_ACCESS_TOKEN is optional; when set, requests include
  // it as a bearer token.
  | "EXPO_PUSH_ENABLED"
  | "EXPO_PUSH_ACCESS_TOKEN"
  // Stripe billing (feature #27). Optional so the demo can run without
  // payment plumbing; /settings renders a disabled state and server
  // actions return friendly errors when unset.
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "STRIPE_PRICE_COLLECTOR"
  | "STRIPE_PRICE_RESERVE"
  | "STRIPE_PRICE_PRIVATE_VAULT"
  | "STRIPE_PRICE_ESTATE"
  | "STRIPE_PRICE_COLLECTOR_FOUNDING"
  | "STRIPE_PRICE_RESERVE_FOUNDING"
  | "STRIPE_PRICE_PRIVATE_VAULT_FOUNDING"
  | "STRIPE_PRICE_ESTATE_FOUNDING"
  | "STRIPE_PRICE_STORAGE_PER_SLOT"
  | "AWS_REGION"
  | "AWS_SES_FROM_EMAIL"
  | "AWS_S3_BUCKET"
  | "AWS_CLOUDFRONT_DOMAIN"
  | "S3_UPLOAD_URL_TTL_SECONDS"
  | "GOOGLE_CLOUD_VISION_API_KEY"
  | "CERTIFICATE_HMAC_SECRET"
  | "FACILITY_COOKIE_SECRET"
  | "LIVEX_API_KEY"
  | "LIVEX_BASE_URL"
  | "CRON_SECRET"
  | "SENTINEL_INGEST_SECRET"
  | "ANTHROPIC_API_KEY";

const REQUIRED: RequiredKey[] = ["DATABASE_URL", "NEXTAUTH_SECRET"];

function read(key: RequiredKey | OptionalKey): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

function assertRequired(): Record<RequiredKey, string> {
  const missing: string[] = [];
  const out = {} as Record<RequiredKey, string>;
  for (const key of REQUIRED) {
    const v = read(key);
    if (!v) {
      missing.push(key);
    } else {
      out[key] = v;
    }
  }
  if (missing.length > 0) {
    // Throwing here halts the Node process at module load. In serverless this
    // surfaces as a 500 on the very first request, which is loud and visible
    // — exactly what we want for misconfiguration.
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in .env (local) or your platform's environment config.`,
    );
  }
  return out;
}

// Skip the assertion during `prisma generate` and similar tooling runs where
// the app code is imported but won't actually run requests. We detect this by
// checking for a sentinel that Next.js sets during real request handling, but
// we're conservative — only skip when explicitly opted out.
const SKIP = process.env.SKIP_ENV_VALIDATION === "true";
const required = SKIP ? ({} as Record<RequiredKey, string>) : assertRequired();

// In any non-dev/test environment both HMAC secrets must be set
// independently — the dev fallback to NEXTAUTH_SECRET means a single
// leak compromises three systems at once (sessions, certificate hashes,
// facility cookies). The gate is an allowlist rather than an equality
// check against "production" so that staging, preview, or any custom
// NODE_ENV value on a non-Vercel deploy doesn't silently skip the
// assertion. Mirrors the pattern used by the cron/ingest `authorized()`
// helpers.
//
// We want this to fail loud at boot in the Node serverless runtime
// (certificate routes, server actions), but NOT in Edge middleware —
// middleware never reads CERTIFICATE_HMAC_SECRET or FACILITY_COOKIE_SECRET,
// so throwing there just turns every request into a 500 with no
// operational benefit. `EdgeRuntime` is a global string set only in the
// Edge runtime; in Node (and in Vitest) it's undefined.
const IS_EDGE_RUNTIME =
  typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== "undefined";

const NODE_ENV = process.env.NODE_ENV;
if (
  !SKIP &&
  !IS_EDGE_RUNTIME &&
  NODE_ENV !== "development" &&
  NODE_ENV !== "test"
) {
  const missingHmac: string[] = [];
  if (!process.env.CERTIFICATE_HMAC_SECRET) missingHmac.push("CERTIFICATE_HMAC_SECRET");
  if (!process.env.FACILITY_COOKIE_SECRET) missingHmac.push("FACILITY_COOKIE_SECRET");
  if (missingHmac.length > 0) {
    throw new Error(
      `[env] Outside development/test, ${missingHmac.join(" and ")} must be set ` +
        `to independent random strings. Falling back to NEXTAUTH_SECRET means a ` +
        `single secret leak compromises every HMAC-protected system.`,
    );
  }
}

export const env = {
  DATABASE_URL: required.DATABASE_URL ?? "",
  NEXTAUTH_SECRET: required.NEXTAUTH_SECRET ?? "",
  NEXTAUTH_URL: read("NEXTAUTH_URL"),
  SENTRY_DSN: read("SENTRY_DSN"),
  UPSTASH_REDIS_REST_URL: read("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: read("UPSTASH_REDIS_REST_TOKEN"),
  NEXT_PUBLIC_SHOW_DEMO_CREDS: read("NEXT_PUBLIC_SHOW_DEMO_CREDS") === "true",
  MOBILE_TOKEN_SECRET:
    read("MOBILE_TOKEN_SECRET") ??
    required.NEXTAUTH_SECRET ??
    read("NEXTAUTH_SECRET") ??
    "",
  MOBILE_TOKEN_TTL_SECONDS: (() => {
    const raw = read("MOBILE_TOKEN_TTL_SECONDS");
    if (!raw) return 60 * 60 * 24 * 30; // 30d
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return 60 * 60 * 24 * 30;
    return Math.min(60 * 60 * 24 * 180, Math.max(60 * 60, n));
  })(),
  EXPO_PUSH_ENABLED: read("EXPO_PUSH_ENABLED") === "true",
  EXPO_PUSH_ACCESS_TOKEN: read("EXPO_PUSH_ACCESS_TOKEN"),
  STRIPE_SECRET_KEY: read("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: read("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRICE_COLLECTOR: read("STRIPE_PRICE_COLLECTOR"),
  STRIPE_PRICE_RESERVE: read("STRIPE_PRICE_RESERVE"),
  STRIPE_PRICE_PRIVATE_VAULT: read("STRIPE_PRICE_PRIVATE_VAULT"),
  STRIPE_PRICE_ESTATE: read("STRIPE_PRICE_ESTATE"),
  STRIPE_PRICE_COLLECTOR_FOUNDING: read("STRIPE_PRICE_COLLECTOR_FOUNDING"),
  STRIPE_PRICE_RESERVE_FOUNDING: read("STRIPE_PRICE_RESERVE_FOUNDING"),
  STRIPE_PRICE_PRIVATE_VAULT_FOUNDING: read("STRIPE_PRICE_PRIVATE_VAULT_FOUNDING"),
  STRIPE_PRICE_ESTATE_FOUNDING: read("STRIPE_PRICE_ESTATE_FOUNDING"),
  STRIPE_PRICE_STORAGE_PER_SLOT: read("STRIPE_PRICE_STORAGE_PER_SLOT"),
  AWS_REGION: read("AWS_REGION"),
  AWS_SES_FROM_EMAIL: read("AWS_SES_FROM_EMAIL"),
  AWS_S3_BUCKET: read("AWS_S3_BUCKET"),
  AWS_CLOUDFRONT_DOMAIN: read("AWS_CLOUDFRONT_DOMAIN"),
  // Presigned upload URL TTL in seconds. Defaults to 5 minutes; bump it if
  // collectors on slow phones see frequent "uploaded too late" failures.
  // Clamped to [60, 900] so a typo can't yield a 1-second or all-day URL.
  S3_UPLOAD_URL_TTL_SECONDS: (() => {
    const raw = read("S3_UPLOAD_URL_TTL_SECONDS");
    if (!raw) return 300;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return 300;
    return Math.min(900, Math.max(60, n));
  })(),
  GOOGLE_CLOUD_VISION_API_KEY: read("GOOGLE_CLOUD_VISION_API_KEY"),
  // Dedicated HMAC secrets for non-session uses. Falling back to
  // NEXTAUTH_SECRET keeps existing dev/seed setups working, but production
  // should set these to independent random strings so a leak of one secret
  // doesn't compromise the others. The double fallback (`required ?? read`)
  // keeps the test setup happy when SKIP_ENV_VALIDATION is on and
  // `required` is the empty stub.
  CERTIFICATE_HMAC_SECRET:
    read("CERTIFICATE_HMAC_SECRET") ??
    required.NEXTAUTH_SECRET ??
    read("NEXTAUTH_SECRET") ??
    "",
  FACILITY_COOKIE_SECRET:
    read("FACILITY_COOKIE_SECRET") ??
    required.NEXTAUTH_SECRET ??
    read("NEXTAUTH_SECRET") ??
    "",
  // Liv-ex live pricing integration (feature #39). When LIVEX_API_KEY is
  // unset the client in src/lib/livex.ts short-circuits to null and the
  // sync job no-ops — seeded WineValuation data renders as it does today.
  LIVEX_API_KEY: read("LIVEX_API_KEY"),
  LIVEX_BASE_URL: read("LIVEX_BASE_URL"),
  // Shared secret that guards /api/cron/livex-sync. Vercel cron sends
  // `Authorization: Bearer <CRON_SECRET>`; the route returns 401 when the
  // header doesn't match. Leave unset in dev if you plan to hit the route
  // manually — it will still reject in production if you forget.
  CRON_SECRET: read("CRON_SECRET"),
  // Shared secret that guards /api/ingest/sensor (feature #21). Sentinel
  // devices send `Authorization: Bearer <SENTINEL_INGEST_SECRET>` on every
  // reading. Leave unset in dev/test to allow unauthenticated posts for
  // local simulation; production MUST set it or the route rejects all
  // traffic.
  SENTINEL_INGEST_SECRET: read("SENTINEL_INGEST_SECRET"),
  // AI Advisor chat (feature #50). When unset, /api/advisor/chat returns
  // 503 with `{ error: "advisor_not_configured" }` and the rest of the app
  // keeps working — same graceful-failure pattern as LIVEX_API_KEY and
  // AWS_S3_BUCKET. Wire up in production once Rob resolves the budget
  // open question in docs/AI-ADVISOR-SPEC.md.
  ANTHROPIC_API_KEY: read("ANTHROPIC_API_KEY"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
} as const;
