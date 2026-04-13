import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We force the module to re-evaluate with Upstash env vars set so the
// upstashCheck path is exercised. Each fetch mock simulates a Redis outage.
describe("rate-limit fail-closed", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.restoreAllMocks();
  });

  it("denies the request when failMode=closed and Upstash throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    const { checkRateLimit } = await import("../rate-limit");
    const result = await checkRateLimit("test:fail-closed", {
      limit: 5,
      windowMs: 60_000,
      failMode: "closed",
    });
    expect(result.allowed).toBe(false);
  });

  it("allows the request when failMode=open (default) and Upstash throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    const { checkRateLimit, __resetMemoryStore } = await import("../rate-limit");
    __resetMemoryStore();
    const result = await checkRateLimit("test:fail-open", {
      limit: 5,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies on Upstash 5xx when failMode=closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const { checkRateLimit } = await import("../rate-limit");
    const result = await checkRateLimit("test:fail-closed-5xx", {
      limit: 5,
      windowMs: 60_000,
      failMode: "closed",
    });
    expect(result.allowed).toBe(false);
  });
});
