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
