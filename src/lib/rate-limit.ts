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

const memStore = new Map<string, { start: number; count: number }>();

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

async function upstashCheck(
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryCheck(key, policy);

  const windowSec = Math.ceil(policy.windowMs / 1000);
  const redisKey = `rl:${key}:${Math.floor(Date.now() / policy.windowMs)}`;

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

    if (!res.ok) return memoryCheck(key, policy);

    const data = (await res.json()) as Array<{ result: number | string }>;
    const count = Number(data[0]?.result ?? 0);
    const allowed = count <= policy.limit;
    return {
      allowed,
      remaining: Math.max(0, policy.limit - count),
      resetAt: (Math.floor(Date.now() / policy.windowMs) + 1) * policy.windowMs,
    };
  } catch {
    return memoryCheck(key, policy);
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
 * Vercel (and most serverless platforms) overwrite x-forwarded-for at the
 * edge with the real client IP, but the header is still attacker-controllable
 * unless we trust the platform's signed alternative. We prefer x-real-ip when
 * present (set by the runtime, not the client) and fall back to the first
 * entry of x-forwarded-for. As a last resort we use a stable "unknown" bucket
 * which means everyone shares the same counter — strict but safe.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip");
  if (real && real.length > 0) return real.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}

/** Reset all in-memory state. Test-only. */
export function __resetMemoryStore(): void {
  memStore.clear();
}
