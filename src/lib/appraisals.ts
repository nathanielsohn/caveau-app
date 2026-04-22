/**
 * Pricing, eligibility, and portfolio-snapshot helpers for feature #61
 * Welcome appraisal.
 *
 * Three concerns colocated here because they're the same logic regardless
 * of surface (member request action, admin completion action, advisor
 * tool): "what does an appraisal cost for this member?", "is this member
 * allowed to claim the founding freebie?", and "which bottles go on this
 * appraisal and what's the total?". Keeping them in one file matches the
 * pattern in `allocations.ts` and `insurance.ts`.
 */

import {
  AppraisalBasis,
  AppraisalPurpose,
  AppraisalStatus,
  Tier,
  WineStatus,
  type Appraisal,
  type Prisma,
} from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber } from "./utils";

// ── Pricing ────────────────────────────────────────────────────────────

/**
 * Tier-scaled per-document price for a paid appraisal. Slotted into the
 * slide-15 revenue band of $5K–$15K Y1 — at ~30–50 docs/yr the weighted
 * average lands in that range. Founding welcome appraisals bypass this
 * via `resolveAppraisalPrice` returning `0` when `isWelcome` is true.
 */
export const APPRAISAL_PRICE_BY_TIER: Record<Tier, number> = {
  [Tier.gold]: 495,       // Collector
  [Tier.reserve]: 795,    // Reserve
  [Tier.platinum]: 1195,  // Private Vault
  [Tier.black]: 1595,     // Estate
};

export interface AppraisalPrice {
  priceUsd: number;
  priceDisplay: string;
}

export function resolveAppraisalPrice(
  tier: Tier,
  isWelcome: boolean,
): AppraisalPrice {
  if (isWelcome) return { priceUsd: 0, priceDisplay: "Included" };
  const priceUsd = APPRAISAL_PRICE_BY_TIER[tier];
  return {
    priceUsd,
    priceDisplay: `$${priceUsd.toLocaleString("en-US")}`,
  };
}

// ── Welcome-appraisal eligibility ──────────────────────────────────────

export type WelcomeEligibilityReason =
  | "eligible"
  | "not_founding"
  | "already_claimed";

export interface WelcomeEligibility {
  eligible: boolean;
  reason: WelcomeEligibilityReason;
}

/**
 * Pure decision function: given a member's founding flag and whether
 * they've already got a welcome appraisal on record, is this request
 * allowed to be the welcome one?
 *
 * Note on "already_claimed": we count ANY welcome-flagged appraisal, not
 * just completed ones. A member with a submitted-but-not-yet-completed
 * welcome appraisal is treated as having already claimed it — they can
 * request a second appraisal at full price, but they can't double-dip on
 * the freebie.
 */
export function decideWelcomeEligibility(input: {
  foundingMember: boolean;
  hasExistingWelcomeAppraisal: boolean;
}): WelcomeEligibility {
  if (!input.foundingMember) {
    return { eligible: false, reason: "not_founding" };
  }
  if (input.hasExistingWelcomeAppraisal) {
    return { eligible: false, reason: "already_claimed" };
  }
  return { eligible: true, reason: "eligible" };
}

/**
 * DB-backed convenience wrapper. Returns the existing welcome-flagged
 * appraisal (if any) alongside the decision — useful for surfaces that
 * want to link to it ("You already claimed your welcome appraisal →
 * view it").
 */
export async function checkWelcomeEligibility(
  memberId: string,
  foundingMember: boolean,
): Promise<WelcomeEligibility & { existing: Appraisal | null }> {
  const existing = foundingMember
    ? await prisma.appraisal.findFirst({
        where: { memberId, isWelcomeAppraisal: true },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const decision = decideWelcomeEligibility({
    foundingMember,
    hasExistingWelcomeAppraisal: existing !== null,
  });
  return { ...decision, existing };
}

// ── Portfolio snapshot (line items) ────────────────────────────────────

/**
 * One row on the rendered appraisal — the bottle, the valuation, and
 * (if the bottle has a current CCR) the CCR number as a custody anchor.
 * Lines are serialized into `appraisals.line_items` JSONB at
 * completion time and never mutated afterward: the document stays
 * stable even if the member sells/drinks a bottle post-issuance.
 */
export interface AppraisalLineItem {
  wineId: string;
  producer: string;
  name: string;
  vintage: number;
  region: string;
  varietal: string;
  currentValueUsd: number;
  ccrAnchor: string | null;
}

export interface AppraisalSnapshot {
  lineItems: AppraisalLineItem[];
  totalBasisUsd: number;
  bottleCount: number;
}

/**
 * Build a line-item + total snapshot for a member's portfolio at the
 * moment of appraisal completion.
 *
 * Scope rules:
 *   - `scopedWineIds` null/undefined → every `in_cellar` wine the member owns
 *   - `scopedWineIds` non-empty array → only those wine ids (intersected
 *     with ownership + status to block a jailbreak or a stale draft)
 *
 * CCR anchor: for each line we look up the most recent non-revoked CCR
 * for the bottle and copy its `certificateNumber` onto the snapshot.
 * Nullable — not every bottle has a CCR issued, and we don't want the
 * appraisal to fail on that account. The CCR number is the trust anchor
 * an insurance underwriter would cite ("value rests on documented
 * custody; see CCR CAV-2026-0031").
 */
export async function buildAppraisalSnapshot(input: {
  memberId: string;
  scopedWineIds?: string[] | null;
}): Promise<AppraisalSnapshot> {
  const where: Prisma.WineWhereInput = {
    memberId: input.memberId,
    status: WineStatus.in_cellar,
  };
  if (input.scopedWineIds && input.scopedWineIds.length > 0) {
    where.id = { in: input.scopedWineIds };
  }

  const wines = await prisma.wine.findMany({
    where,
    include: {
      certificates: {
        where: { revokedAt: null },
        orderBy: { monitoringEnd: "desc" },
        take: 1,
        select: { certificateNumber: true },
      },
    },
    orderBy: [{ currentValue: "desc" }, { name: "asc" }],
  });

  const lineItems: AppraisalLineItem[] = wines.map((w) => ({
    wineId: w.id,
    producer: w.producer,
    name: w.name,
    vintage: w.vintage,
    region: w.region,
    varietal: w.varietal,
    currentValueUsd: toNumber(w.currentValue),
    ccrAnchor: w.certificates[0]?.certificateNumber ?? null,
  }));

  const totalBasisUsd = lineItems.reduce(
    (sum, li) => sum + li.currentValueUsd,
    0,
  );

  return {
    lineItems,
    totalBasisUsd,
    bottleCount: lineItems.length,
  };
}

// ── Appraisal number generation ────────────────────────────────────────

/**
 * Format: `CAV-APR-YYYY-NNNN`. YYYY is the year of the effective date
 * (what appears on the document), NNNN is 1-indexed zero-padded across
 * all completed appraisals that year.
 *
 * Not collision-proof under concurrent commits — two staff users
 * completing appraisals in the same millisecond could race and hit the
 * `appraisal_number` unique constraint. That's fine: the unique
 * constraint catches it, the completion action retries, and the second
 * caller gets NNNN+1. At demo scale (one staff user, no concurrency)
 * this never triggers; at prod scale a serial column backing a view
 * would be cleaner but is premature.
 */
export async function nextAppraisalNumber(effectiveDate: Date): Promise<string> {
  const year = effectiveDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const count = await prisma.appraisal.count({
    where: {
      status: AppraisalStatus.completed,
      effectiveDate: { gte: yearStart, lt: yearEnd },
    },
  });
  return `CAV-APR-${year}-${String(count + 1).padStart(4, "0")}`;
}

// ── Display helpers ────────────────────────────────────────────────────

export const BASIS_LABELS: Record<AppraisalBasis, string> = {
  [AppraisalBasis.fair_market_value]: "Fair market value",
  [AppraisalBasis.retail_replacement]: "Retail replacement",
  [AppraisalBasis.auction_estimate]: "Auction estimate",
};

export const BASIS_DESCRIPTIONS: Record<AppraisalBasis, string> = {
  [AppraisalBasis.fair_market_value]:
    "The price a willing buyer would pay a willing seller in an open market. Standard for most insurance binders.",
  [AppraisalBasis.retail_replacement]:
    "The cost to replace each bottle at today's retail pricing. Used by replacement-cost policies; typically 10–25% above fair market.",
  [AppraisalBasis.auction_estimate]:
    "The low-to-mid range a wine auction house would estimate. Used for estate liquidation, charitable donations, or conservative planning.",
};

export const PURPOSE_LABELS: Record<AppraisalPurpose, string> = {
  [AppraisalPurpose.insurance]: "Insurance",
  [AppraisalPurpose.estate]: "Estate planning",
  [AppraisalPurpose.tax_donation]: "Tax / charitable donation",
  [AppraisalPurpose.divorce]: "Divorce / dissolution",
  [AppraisalPurpose.gift]: "Gift",
  [AppraisalPurpose.personal]: "Personal records",
};

export const STATUS_LABELS: Record<AppraisalStatus, string> = {
  [AppraisalStatus.submitted]: "Submitted",
  [AppraisalStatus.in_progress]: "In progress",
  [AppraisalStatus.completed]: "Completed",
  [AppraisalStatus.cancelled]: "Cancelled",
};

/**
 * Default appraiser block. Used by the onboarding claim flow and as a
 * prefill on the admin authoring form — staff can edit if a different
 * appraiser signed off. Credentials follow the American Society of
 * Appraisers (ASA) and Certified Wine Appraisers Association (CWAA)
 * naming used on slide 11 for the head sommelier role.
 */
export const DEFAULT_APPRAISER = {
  name: "Samuel Kliewer",
  creds: "ASA Certified Personal Property Appraiser · CWAA Certified Wine Specialist",
  scope:
    "In-person inventory count against Sentinel-monitored custody records. Valuations reconciled against Liv-ex market data and recent auction results for comparable vintages.",
} as const;

// ── Estate heirs shape ─────────────────────────────────────────────────

export interface AppraisalHeir {
  name: string;
  share: string;
}

/**
 * Narrow a JSON value back to a heirs array for the PDF renderer and
 * advisor tool. Tolerant of legacy rows / malformed seeds — we never
 * want a corrupt heirs payload to hard-fail the appraisal view.
 */
export function parseHeirs(value: Prisma.JsonValue | null): AppraisalHeir[] {
  if (!Array.isArray(value)) return [];
  const out: AppraisalHeir[] = [];
  for (const entry of value) {
    if (
      entry &&
      typeof entry === "object" &&
      "name" in entry &&
      "share" in entry &&
      typeof (entry as { name: unknown }).name === "string" &&
      typeof (entry as { share: unknown }).share === "string"
    ) {
      out.push({
        name: (entry as { name: string }).name,
        share: (entry as { share: string }).share,
      });
    }
  }
  return out;
}

/**
 * Narrow JSON back to line items for the PDF renderer and advisor tool.
 * Same tolerance rationale as parseHeirs.
 */
export function parseLineItems(
  value: Prisma.JsonValue | null,
): AppraisalLineItem[] {
  if (!Array.isArray(value)) return [];
  const out: AppraisalLineItem[] = [];
  for (const entry of value) {
    if (
      entry &&
      typeof entry === "object" &&
      "wineId" in entry &&
      "name" in entry &&
      "vintage" in entry &&
      "currentValueUsd" in entry
    ) {
      const e = entry as Record<string, unknown>;
      out.push({
        wineId: String(e.wineId),
        producer: typeof e.producer === "string" ? e.producer : "",
        name: String(e.name),
        vintage: typeof e.vintage === "number" ? e.vintage : 0,
        region: typeof e.region === "string" ? e.region : "",
        varietal: typeof e.varietal === "string" ? e.varietal : "",
        currentValueUsd:
          typeof e.currentValueUsd === "number" ? e.currentValueUsd : 0,
        ccrAnchor: typeof e.ccrAnchor === "string" ? e.ccrAnchor : null,
      });
    }
  }
  return out;
}
