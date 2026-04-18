/**
 * Rate limiter with two backends.
 *
 * Local in-memory is fine for dev and acceptable as a fallback in single-region
 * serverless, but each cold start resets the counter, so it does not provide
 * a real ceiling against a determined attacker. When UPSTASH_REDIS_REST_URL
 * and UPSTASH_REDIS_REST_TOKEN are set we route through Upstash's REST API,
 * which gives us a single shared counter across every Lambda instance.
 *
 * The interface is intentionally narrow: one async function that takes a key
 * and a policy, returns whether the request should be allowed. Per-route
 * policies live in src/middleware.ts so the trade-offs stay visible there.
 */

import { env } from "./env";

export interface RateLimitPolicy {
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * What to do when the Upstash backend is unreachable.
   *
   *   - "open" (default): allow the request and fall back to in-memory.
   *     Fine for read endpoints where availability beats hard ceilings.
   *   - "closed": block the request. Use on auth/signup so a Redis outage
   *     can't silently turn off brute-force protection.
   */
  failMode?: "open" | "closed";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ── In-memory backend ─────────────────────────────────────────────────────
//
// Uses a single Map keyed by `${policy}:${key}`. Each entry is the window
// start (epoch ms) and the count inside that window. We sweep expired entries
// opportunistically to bound memory growth without scheduling a timer (which
// would keep the Lambda warm and bill us for nothing).
//
// MEM_CAP is a hard ceiling so a botnet rotating through IPs can't grow the
// Map without bound. When the cap is exceeded we evict the oldest entries
// (by window start) until we're back under the limit — a crude LRU that
// costs O(n log n) but only runs when the cap is already breached. On a
// single Vercel Lambda, 10k entries is ~1MB, well inside the budget.

const MEM_CAP = 10_000;
const memStore = new Map<string, { start: number; count: number }>();

function evictOldest(): void {
  const entries = Array.from(memStore.entries());
  entries.sort((a, b) => a[1].start - b[1].start);
  const toEvict = entries.length - Math.floor(MEM_CAP * 0.9);
  // Cap breaches are operationally interesting (botnet rotating IPs, or
  // Upstash falling back to memory under load), so we log every time. Use
  // console.warn directly — this module is reachable from middleware which
  // runs in the Edge runtime, and the structured logger pulls in Sentry's
  // dynamic import which Edge forbids. A flat console line is enough for
  // Vercel's log drains to pick up.
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "Rate limiter memory cap breached — evicting oldest entries",
      entries: memStore.size,
      evicting: toEvict,
      cap: MEM_CAP,
    }),
  );
  for (let i = 0; i < toEvict; i++) {
    const entry = entries[i];
    if (entry) memStore.delete(entry[0]);
  }
}

function memoryCheck(
  key: string,
  policy: RateLimitPolicy,
): RateLimitResult {
  const now = Date.now();

  if (Math.random() < 0.01) {
    memStore.forEach((v, k) => {
      if (now - v.start >= policy.windowMs) memStore.delete(k);
    });
  }

  if (memStore.size >= MEM_CAP) {
    evictOldest();
  }

  const entry = memStore.get(key);
  if (!entry || now - entry.start >= policy.windowMs) {
    memStore.set(key, { start: now, count: 1 });
    return {
      allowed: true,
      remaining: policy.limit - 1,
      resetAt: now + policy.windowMs,
    };
  }

  if (entry.count >= policy.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.start + policy.windowMs,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: policy.limit - entry.count,
    resetAt: entry.start + policy.windowMs,
  };
}

// ── Upstash Redis (REST) backend ──────────────────────────────────────────
//
// Atomic INCR + EXPIRE per window. We don't depend on the @upstash/redis
// package — a single fetch() to the REST API is enough and keeps the bundle
// minimal. If Upstash returns an error we fall back to allowing the request
// (fail-open) rather than blocking real users on infrastructure flakes; the
// alternative is to fail-closed, but we want availability over a hard ceiling
// here.

function failResult(
  policy: RateLimitPolicy,
  allowed: boolean,
): RateLimitResult {
  return {
    allowed,
    remaining: 0,
    resetAt: Date.now() + policy.windowMs,
  };
}

async function upstashCheck(
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryCheck(key, policy);

  const windowSec = Math.ceil(policy.windowMs / 1000);
  const redisKey = `rl:${key}:${Math.floor(Date.now() / policy.windowMs)}`;

  const failClosed = policy.failMode === "closed";

  try {
    // Pipeline INCR + EXPIRE in a single round trip.
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSec)],
      ]),
      // Don't let a slow Redis hold a request hostage.
      signal: AbortSignal.timeout(500),
    });

    if (!res.ok) {
      // Auth endpoints (failClosed) MUST refuse traffic when their backing
      // ceiling disappears — a silent fall-back to per-instance memory means
      // a determined attacker just bursts across cold starts. Read endpoints
      // (failOpen) prefer availability and degrade to memory.
      return failClosed ? failResult(policy, false) : memoryCheck(key, policy);
    }

    const data = (await res.json()) as Array<{ result: number | string }>;
    const count = Number(data[0]?.result ?? 0);
    const allowed = count <= policy.limit;
    return {
      allowed,
      remaining: Math.max(0, policy.limit - count),
      resetAt: (Math.floor(Date.now() / policy.windowMs) + 1) * policy.windowMs,
    };
  } catch {
    return failClosed ? failResult(policy, false) : memoryCheck(key, policy);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

const useUpstash = !!(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
);

export async function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  return useUpstash ? upstashCheck(key, policy) : memoryCheck(key, policy);
}

/**
 * Resolve the client IP from request headers.
 *
 * We trust only `x-real-ip`. On Vercel that header is set by the edge
 * runtime and is not attacker-controllable. `x-forwarded-for`, by
 * contrast, is whatever the client sent if we aren't sitting behind a
 * trusted proxy that overwrites it — which is not a guarantee we can
 * make across deploy targets (Render, Railway, self-hosted Docker,
 * future platform changes). Trusting it would turn every limiter into
 * "attacker picks their own bucket per request" via header spoofing.
 *
 * When x-real-ip is absent we fall back to a shared "unknown" bucket
 * rather than reading XFF. That's strict — everyone competes for the
 * same counter — but safe: an attacker who removes x-real-ip lands in
 * the same bucket as every other mystery-source client and can't fan
 * out.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip");
  if (real && real.length > 0) return real.trim();
  return "unknown";
}

/** Reset all in-memory state. Test-only. */
export function __resetMemoryStore(): void {
  memStore.clear();
}
