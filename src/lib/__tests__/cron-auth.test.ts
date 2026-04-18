/**
 * Auth-branch regression tests for the cron + ingest routes.
 *
 * These routes are reachable from the public internet (Vercel cron hits a
 * URL, Sentinel devices POST from the field), so every non-dev NODE_ENV
 * without the right Bearer secret must return 401. Anything else is a
 * security regression. The tests are intentionally narrow — they don't
 * exercise Prisma or Anthropic, just the gatekeeping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sensorReading: { create: vi.fn(), findUnique: vi.fn() },
    wine: { findMany: vi.fn().mockResolvedValue([]) },
    locker: { findUnique: vi.fn() },
    alert: { findFirst: vi.fn(), create: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 100, resetAt: 0 }),
}));

vi.mock("@/lib/livex", () => ({
  fetchLivexPrice: vi.fn().mockResolvedValue(null),
  isLivexConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/notify-alert", () => ({
  notifyAlert: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// The route modules read env at import time; mock it so we can flip
// NODE_ENV + secrets per test without re-requiring the module.
const envState = {
  NODE_ENV: "test" as string,
  CRON_SECRET: undefined as string | undefined,
  SENTINEL_INGEST_SECRET: undefined as string | undefined,
  ANTHROPIC_API_KEY: undefined as string | undefined,
  LIVEX_API_KEY: undefined as string | undefined,
};

vi.mock("@/lib/env", () => ({
  env: new Proxy(
    {},
    {
      get: (_t, key: string) => envState[key as keyof typeof envState],
    },
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  envState.NODE_ENV = "test";
  envState.CRON_SECRET = undefined;
  envState.SENTINEL_INGEST_SECRET = undefined;
  envState.LIVEX_API_KEY = undefined;
});

// ── /api/cron/sensor-retention ────────────────────────────────────────

describe("GET /api/cron/sensor-retention auth", () => {
  it("allows unauthenticated calls in test when CRON_SECRET is unset", async () => {
    envState.NODE_ENV = "test";
    envState.CRON_SECRET = undefined;
    const { GET } = await import("@/app/api/cron/sensor-retention/route");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/sensor-retention"),
    );
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated calls when NODE_ENV=production and CRON_SECRET is unset", async () => {
    envState.NODE_ENV = "production";
    envState.CRON_SECRET = undefined;
    const { GET } = await import("@/app/api/cron/sensor-retention/route");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/sensor-retention"),
    );
    expect(res.status).toBe(401);
  });

  it("rejects when Bearer secret is wrong", async () => {
    envState.NODE_ENV = "production";
    envState.CRON_SECRET = "correct-secret";
    const { GET } = await import("@/app/api/cron/sensor-retention/route");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/sensor-retention", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects when Bearer secret length matches but value differs", async () => {
    envState.NODE_ENV = "production";
    envState.CRON_SECRET = "abc123";
    const { GET } = await import("@/app/api/cron/sensor-retention/route");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/sensor-retention", {
        // Same length as "Bearer abc123" but different content.
        headers: { authorization: "Bearer xyz987" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts a matching Bearer secret in production", async () => {
    envState.NODE_ENV = "production";
    envState.CRON_SECRET = "correct-secret";
    const { GET } = await import("@/app/api/cron/sensor-retention/route");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/sensor-retention", {
        headers: { authorization: "Bearer correct-secret" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an unrecognized NODE_ENV without a secret (fails closed)", async () => {
    // A misconfigured staging/preview env with NODE_ENV not in the
    // allowlist must never silently expose the route.
    envState.NODE_ENV = "staging";
    envState.CRON_SECRET = undefined;
    const { GET } = await import("@/app/api/cron/sensor-retention/route");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/sensor-retention"),
    );
    expect(res.status).toBe(401);
  });
});

// ── /api/cron/livex-sync ──────────────────────────────────────────────

describe("GET /api/cron/livex-sync auth + skip branch", () => {
  it("rejects without Bearer in production", async () => {
    envState.NODE_ENV = "production";
    envState.CRON_SECRET = undefined;
    const { GET } = await import("@/app/api/cron/livex-sync/route");
    const res = await GET(new NextRequest("http://localhost/api/cron/livex-sync"));
    expect(res.status).toBe(401);
  });

  it("returns skipped when LIVEX_API_KEY is unset", async () => {
    envState.NODE_ENV = "test";
    envState.CRON_SECRET = undefined;
    envState.LIVEX_API_KEY = undefined;
    const { GET } = await import("@/app/api/cron/livex-sync/route");
    const res = await GET(new NextRequest("http://localhost/api/cron/livex-sync"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("skipped");
    expect(body.reason).toBe("not_configured");
  });
});

// ── /api/ingest/sensor ────────────────────────────────────────────────

describe("POST /api/ingest/sensor auth", () => {
  it("rejects without Bearer in production", async () => {
    envState.NODE_ENV = "production";
    envState.SENTINEL_INGEST_SECRET = undefined;
    const { POST } = await import("@/app/api/ingest/sensor/route");
    const res = await POST(
      new NextRequest("http://localhost/api/ingest/sensor", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects on an unrecognized NODE_ENV without a secret", async () => {
    envState.NODE_ENV = "staging";
    envState.SENTINEL_INGEST_SECRET = undefined;
    const { POST } = await import("@/app/api/ingest/sensor/route");
    const res = await POST(
      new NextRequest("http://localhost/api/ingest/sensor", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects on wrong Bearer secret", async () => {
    envState.NODE_ENV = "production";
    envState.SENTINEL_INGEST_SECRET = "correct";
    const { POST } = await import("@/app/api/ingest/sensor/route");
    const res = await POST(
      new NextRequest("http://localhost/api/ingest/sensor", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });
});
