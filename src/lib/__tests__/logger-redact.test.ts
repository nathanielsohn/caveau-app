import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../logger";

describe("logger redaction", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  function lastCallString(spy: ReturnType<typeof vi.spyOn>): string {
    const calls = spy.mock.calls;
    return JSON.stringify(calls[calls.length - 1]);
  }

  it("redacts password fields at the top level", () => {
    logger.info("test", { userId: "u1", password: "hunter2" });
    const out = lastCallString(logSpy);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("hunter2");
  });

  it("redacts token, secret, authorization, cookie keys", () => {
    logger.info("test", {
      sessionToken: "abc",
      apiSecret: "xyz",
      authorization: "Bearer 123",
      cookie: "id=42",
    });
    const out = lastCallString(logSpy);
    expect(out).not.toContain("abc");
    expect(out).not.toContain("xyz");
    expect(out).not.toContain("Bearer 123");
    expect(out).not.toContain("id=42");
  });

  it("redacts nested sensitive keys", () => {
    logger.info("test", {
      user: { id: "u1", password: "hunter2", profile: { token: "secret-tok" } },
    });
    const out = lastCallString(logSpy);
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("secret-tok");
    expect(out).toContain("u1");
  });

  it("leaves benign fields untouched", () => {
    logger.info("test", { userId: "u1", route: "/api/x" });
    const out = lastCallString(logSpy);
    expect(out).toContain("u1");
    expect(out).toContain("/api/x");
  });
});
