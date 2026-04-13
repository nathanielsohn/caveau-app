import { createHmac } from "crypto";

/**
 * HMAC-SHA256 over the certificate's identifying tuple, keyed by the
 * server secret. An attacker who learns the certificate's data format
 * still cannot forge a hash without the key, which means the public
 * `/verify/<hash>` lookup stays unguessable even if the UUID leaks.
 */
export function certificateIntegrityHash(input: {
  wineId: string;
  lockerId: string;
  monitoringStart: Date | string;
  monitoringEnd: Date | string;
}): string {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error(
      "NEXTAUTH_SECRET is required to compute certificate integrity hashes",
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
