import { createHmac } from "crypto";
import { env } from "./env";

/**
 * HMAC-SHA256 over an appraisal's identifying tuple, keyed by the same
 * dedicated certificate secret as `certificateIntegrityHash`. Re-using the
 * key keeps the trust model simple: a verifier already trusts that key for
 * the public CCR, so an attacker who can forge an appraisal hash can
 * already forge a CCR hash (and vice versa). Separating the keys would
 * add operational overhead without meaningfully shrinking blast radius.
 *
 * Included fields — every piece of data the public verify page exposes:
 *
 *   - `id`            — appraisal UUID (PK)
 *   - `memberId`      — owner (binding the doc to one collector)
 *   - `effectiveDate` — point-in-time the valuation applies to
 *   - `purpose`       — insurance / estate / etc
 *   - `basis`         — fair_market_value / retail_replacement / auction_estimate
 *   - `totalBasisUsd` — rounded to cents so two Decimals with the same
 *                       money value hash identically
 *
 * `appraisalNumber` is deliberately NOT in the hash: the number is
 * derived from the effective date year plus a serial count at commit
 * time, so including it would just circle back to the same inputs.
 * `lineItems` is also excluded: bottle valuations are attested inside
 * the document, not the hash — if we included them, a single cent
 * rounding difference would break verification.
 */
export function appraisalIntegrityHash(input: {
  id: string;
  memberId: string;
  effectiveDate: Date | string;
  purpose: string;
  basis: string;
  totalBasisUsd: number;
}): string {
  const key = env.CERTIFICATE_HMAC_SECRET;
  if (!key) {
    throw new Error(
      "CERTIFICATE_HMAC_SECRET (or NEXTAUTH_SECRET fallback) is required to compute appraisal integrity hashes",
    );
  }
  const effective =
    input.effectiveDate instanceof Date
      ? input.effectiveDate.toISOString()
      : input.effectiveDate;
  // Round to cents so a re-hash of the same row (Decimal → number round-trip)
  // produces the same digest. Without this, 12345.6 and 12345.60 would
  // differ when serialized.
  const total = Math.round(input.totalBasisUsd * 100) / 100;
  const tuple = [
    input.id,
    input.memberId,
    effective,
    input.purpose,
    input.basis,
    total.toFixed(2),
  ].join("|");
  return createHmac("sha256", key).update(tuple).digest("hex");
}
