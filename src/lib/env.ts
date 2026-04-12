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
  | "NEXT_PUBLIC_SHOW_DEMO_CREDS";

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

export const env = {
  DATABASE_URL: required.DATABASE_URL ?? "",
  NEXTAUTH_SECRET: required.NEXTAUTH_SECRET ?? "",
  NEXTAUTH_URL: read("NEXTAUTH_URL"),
  SENTRY_DSN: read("SENTRY_DSN"),
  UPSTASH_REDIS_REST_URL: read("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: read("UPSTASH_REDIS_REST_TOKEN"),
  NEXT_PUBLIC_SHOW_DEMO_CREDS: read("NEXT_PUBLIC_SHOW_DEMO_CREDS") === "true",
  NODE_ENV: process.env.NODE_ENV ?? "development",
} as const;
