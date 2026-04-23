import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

export type MobileTokenPayload = {
  sub: string;
  sv: number;
  iat: number;
  exp: number;
};

function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(input: string): Buffer | null {
  if (!input || typeof input !== "string") return null;
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  try {
    return Buffer.from(`${normalized}${pad}`, "base64");
  } catch {
    return null;
  }
}

function sign(input: string): string {
  const key = env.MOBILE_TOKEN_SECRET;
  if (!key) {
    throw new Error(
      "MOBILE_TOKEN_SECRET (or NEXTAUTH_SECRET fallback) is required to sign mobile tokens",
    );
  }
  return base64urlEncode(createHmac("sha256", key).update(input).digest());
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function createMobileToken(input: {
  memberId: string;
  sessionVersion: number;
  now?: Date;
  ttlSeconds?: number;
}): { token: string; expiresAt: Date } {
  const now = input.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const ttl = Math.max(60, Math.min(60 * 60 * 24 * 180, input.ttlSeconds ?? env.MOBILE_TOKEN_TTL_SECONDS));
  const exp = iat + ttl;

  const payload: MobileTokenPayload = {
    sub: input.memberId,
    sv: input.sessionVersion,
    iat,
    exp,
  };

  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return { token: `${payloadB64}.${sig}`, expiresAt: new Date(exp * 1000) };
}

export function verifyMobileToken(token: string): {
  ok: true;
  payload: MobileTokenPayload;
} | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "invalid_token" };
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { ok: false, error: "invalid_token" };

  const expected = sign(payloadB64);
  if (!safeEqual(sig, expected)) return { ok: false, error: "invalid_token" };

  const payloadBuf = base64urlDecode(payloadB64);
  if (!payloadBuf) return { ok: false, error: "invalid_token" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return { ok: false, error: "invalid_token" };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("sub" in parsed) ||
    !("sv" in parsed) ||
    !("iat" in parsed) ||
    !("exp" in parsed)
  ) {
    return { ok: false, error: "invalid_token" };
  }

  const p = parsed as MobileTokenPayload;
  if (typeof p.sub !== "string" || p.sub.length < 1) return { ok: false, error: "invalid_token" };
  if (typeof p.sv !== "number" || !Number.isFinite(p.sv)) return { ok: false, error: "invalid_token" };
  if (typeof p.iat !== "number" || !Number.isFinite(p.iat)) return { ok: false, error: "invalid_token" };
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return { ok: false, error: "invalid_token" };

  const now = Math.floor(Date.now() / 1000);
  if (p.exp <= now) return { ok: false, error: "token_expired" };

  return { ok: true, payload: p };
}

