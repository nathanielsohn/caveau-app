import { createHmac } from "crypto";
import { env } from "./env";

/**
 * HMAC-SHA256 over the certificate's identifying tuple, keyed by a
 * dedicated certificate secret. An attacker who learns the certificate's
 * data format still cannot forge a hash without the key, which means the
 * public `/verify/<hash>` lookup stays unguessable even if the UUID leaks.
 *
 * The key is CERTIFICATE_HMAC_SECRET when set, otherwise it falls back to
 * NEXTAUTH_SECRET (see src/lib/env.ts). Production should set the dedicated
 * secret so a leak of the session key doesn't let an attacker forge
 * certificate hashes.
 */
export function certificateIntegrityHash(input: {
  wineId: string;
  lockerId: string;
  monitoringStart: Date | string;
  monitoringEnd: Date | string;
}): string {
  const key = env.CERTIFICATE_HMAC_SECRET;
  if (!key) {
    throw new Error(
      "CERTIFICATE_HMAC_SECRET (or NEXTAUTH_SECRET fallback) is required to compute certificate integrity hashes",
    );
  }
  const start =
    input.monitoringStart instanceof Date
      ? input.monitoringStart.toISOString()
      : input.monitoringStart;
  const end =
    input.monitoringEnd instanceof Date
      ? input.monitoringEnd.toISOString()
      : input.monitoringEnd;
  return createHmac("sha256", key)
    .update(`${input.wineId}|${input.lockerId}|${start}|${end}`)
    .digest("hex");
}

/**
 * Sign a provenance bundle (feature #40 export). Uses the same
 * CERTIFICATE_HMAC_SECRET key as `certificateIntegrityHash` — a verifier
 * already trusts that key for the public certificate, so reusing it for the
 * exported bundle keeps the trust model unchanged.
 *
 * The signature is computed over a canonical JSON serialization with sorted
 * object keys so re-serializing the same bundle yields the same signature
 * regardless of property ordering. The signature itself is excluded from the
 * input (you can't sign your own signature).
 */
export function provenanceBundleHash(bundle: unknown): string {
  const key = env.CERTIFICATE_HMAC_SECRET;
  if (!key) {
    throw new Error(
      "CERTIFICATE_HMAC_SECRET (or NEXTAUTH_SECRET fallback) is required to sign provenance bundles",
    );
  }
  return createHmac("sha256", key)
    .update(canonicalJson(bundle))
    .digest("hex");
}

/**
 * Stable, key-sorted JSON serialization. Two objects with the same content
 * but different key insertion order serialize identically — required for
 * deterministic HMAC signing.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`,
  );
  return `{${parts.join(",")}}`;
}
