import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

// Stub next/headers + prisma + env so we can import current-facility without
// booting the full Next runtime. env is re-mocked per test to swap the secret
// that signValue/verifySigned key off.
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));
vi.mock("../prisma", () => ({ prisma: {} }));
vi.mock("../auth", () => ({ getServerAuth: async () => null }));

const SECRET_A = "test-secret-alpha-padding==";
const SECRET_B = "test-secret-bravo-different==";

async function importWithSecret(secret: string) {
  vi.resetModules();
  vi.doMock("../env", () => ({ env: { NEXTAUTH_SECRET: secret } }));
  return import("../current-facility");
}

describe("signed facility cookie", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../env");
  });

  it("round-trips a valid signed value", async () => {
    const { signValue, verifySigned } = await importWithSecret(SECRET_A);
    const signed = signValue("facility-123");
    expect(signed.startsWith("facility-123.")).toBe(true);
    expect(verifySigned(signed)).toBe("facility-123");
  });

  it("rejects a tampered signature", async () => {
    const { signValue, verifySigned } = await importWithSecret(SECRET_A);
    const signed = signValue("facility-123");
    // Flip the last character of the signature — same length, wrong bytes.
    const last = signed.charAt(signed.length - 1);
    const flipped = signed.slice(0, -1) + (last === "a" ? "b" : "a");
    expect(verifySigned(flipped)).toBeNull();
  });

  it("rejects a truncated cookie with no separator", async () => {
    const { verifySigned } = await importWithSecret(SECRET_A);
    expect(verifySigned("facility-123")).toBeNull();
    expect(verifySigned("")).toBeNull();
    expect(verifySigned(".only-sig")).toBeNull();
    expect(verifySigned("only-value.")).toBeNull();
  });

  it("rejects a signature produced by a different secret", async () => {
    // Manually forge a value signed with SECRET_A, then verify using a
    // module instance bound to SECRET_B. We can't re-import for signing
    // and verifying in the same test without the mocks colliding, so we
    // compute the A-signature inline and only import once (with B).
    const sigA = createHmac("sha256", SECRET_A)
      .update("facility-123")
      .digest("base64url");
    const signedWithA = `facility-123.${sigA}`;

    const { verifySigned } = await importWithSecret(SECRET_B);
    expect(verifySigned(signedWithA)).toBeNull();
  });
});
