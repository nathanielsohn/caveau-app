import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clientIp, __resetMemoryStore } from "../rate-limit";

describe("checkRateLimit (in-memory backend)", () => {
  beforeEach(() => {
    __resetMemoryStore();
  });

  it("allows requests up to the limit", async () => {
    const policy = { limit: 3, windowMs: 60_000 };
    const r1 = await checkRateLimit("test:ip-a", policy);
    const r2 = await checkRateLimit("test:ip-a", policy);
    const r3 = await checkRateLimit("test:ip-a", policy);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r3.remaining).toBe(0);
  });

  it("blocks the request that exceeds the limit", async () => {
    const policy = { limit: 2, windowMs: 60_000 };
    await checkRateLimit("test:ip-b", policy);
    await checkRateLimit("test:ip-b", policy);
    const blocked = await checkRateLimit("test:ip-b", policy);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("isolates buckets per key", async () => {
    const policy = { limit: 1, windowMs: 60_000 };
    const r1 = await checkRateLimit("test:ip-c", policy);
    const r2 = await checkRateLimit("test:ip-d", policy);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("returns a resetAt timestamp in the future", async () => {
    const before = Date.now();
    const result = await checkRateLimit("test:ip-e", {
      limit: 1,
      windowMs: 60_000,
    });
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60_000 + 50);
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip over x-forwarded-for", () => {
    const headers = new Headers();
    headers.set("x-real-ip", "10.0.0.1");
    headers.set("x-forwarded-for", "203.0.113.5, 10.0.0.1");
    expect(clientIp(headers)).toBe("10.0.0.1");
  });

  it("ignores x-forwarded-for when x-real-ip is absent", () => {
    // XFF is attacker-controllable on non-Vercel ingress, so the
    // implementation deliberately never reads it. Make sure a spoofed
    // XFF-only request lands in the shared 'unknown' bucket.
    const headers = new Headers();
    headers.set("x-forwarded-for", "198.51.100.7, 10.0.0.1");
    expect(clientIp(headers)).toBe("unknown");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("trims whitespace in x-real-ip", () => {
    const headers = new Headers();
    headers.set("x-real-ip", "  10.0.0.5  ");
    expect(clientIp(headers)).toBe("10.0.0.5");
  });
});
