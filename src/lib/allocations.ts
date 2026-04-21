import {
  AllocationRequestStatus,
  AllocationStatus,
  Tier,
  type Allocation,
  type AllocationRequest,
} from "@prisma/client";
import { tierAtLeast } from "./tiers";

/**
 * Allocation helpers (feature #60).
 *
 * Single source of truth for eligibility math, quantity invariants, and
 * per-request lifecycle transitions. The member feed query, detail page
 * guard, request-submit action, admin accept/fulfill actions, and the
 * advisor tool all route through this file so the gate stays consistent.
 */

/** Per-member upper bound on a single request. Keeps one collector from
 *  requesting the entire allotment on a scarce release. */
export const MAX_BOTTLES_PER_REQUEST = 3;

export interface MemberEligibilityInput {
  tier: Tier;
  foundingMember: boolean;
}

export interface EligibilityDecision {
  eligible: boolean;
  /** Short human-readable reason shown on the detail page when
   *  !eligible. Empty when eligible. */
  reason: string;
}

/**
 * Decide whether a member can see / request a given allocation right now.
 *
 * Rules (all must hold):
 *   1. Allocation is in `published` status.
 *   2. Member's tier is >= `minimumTier` on the Collector→Estate ladder.
 *   3. If `foundingOnly`, member must be a founding member.
 *   4. If before `opensAt`, only founding members see it and only when
 *      `foundingEarlyAccess` is true.
 *   5. `now` must be <= `closesAt`.
 */
export function decideEligibility(
  member: MemberEligibilityInput,
  allocation: Pick<
    Allocation,
    | "status"
    | "minimumTier"
    | "foundingOnly"
    | "foundingEarlyAccess"
    | "opensAt"
    | "closesAt"
  >,
  now: Date = new Date(),
): EligibilityDecision {
  if (allocation.status !== AllocationStatus.published) {
    return { eligible: false, reason: "This release is not open." };
  }
  if (!tierAtLeast(member.tier, allocation.minimumTier)) {
    return {
      eligible: false,
      reason: `Reserved for ${tierDisplayName(allocation.minimumTier)} tier and above.`,
    };
  }
  if (allocation.foundingOnly && !member.foundingMember) {
    return {
      eligible: false,
      reason: "Reserved for Founding Circle members.",
    };
  }
  if (now > allocation.closesAt) {
    return { eligible: false, reason: "Requests are closed for this release." };
  }
  if (now < allocation.opensAt) {
    const earlyOpen =
      allocation.foundingEarlyAccess && member.foundingMember;
    if (!earlyOpen) {
      return {
        eligible: false,
        reason: "Opens to your tier soon — check back after the release date.",
      };
    }
  }
  return { eligible: true, reason: "" };
}

/** Convenience boolean for feed-level filters. */
export function isEligible(
  member: MemberEligibilityInput,
  allocation: Pick<
    Allocation,
    | "status"
    | "minimumTier"
    | "foundingOnly"
    | "foundingEarlyAccess"
    | "opensAt"
    | "closesAt"
  >,
  now: Date = new Date(),
): boolean {
  return decideEligibility(member, allocation, now).eligible;
}

/**
 * How many bottles are still available — accounting for accepted +
 * fulfilled requests. Submitted (pending) requests do NOT consume
 * quantity until staff accepts them. Returns a non-negative integer.
 */
export function bottlesClaimed(
  requests: Pick<AllocationRequest, "status" | "quantityRequested">[],
): number {
  let claimed = 0;
  for (const r of requests) {
    if (
      r.status === AllocationRequestStatus.accepted ||
      r.status === AllocationRequestStatus.fulfilled
    ) {
      claimed += r.quantityRequested;
    }
  }
  return claimed;
}

export function bottlesRemaining(
  allocation: Pick<Allocation, "quantity">,
  requests: Pick<AllocationRequest, "status" | "quantityRequested">[],
): number {
  return Math.max(0, allocation.quantity - bottlesClaimed(requests));
}

/**
 * Upper bound on what a member can request on a single allocation.
 * Capped at MAX_BOTTLES_PER_REQUEST and at whatever's still physically
 * available. Zero when the allocation is fully claimed.
 */
export function maxRequestQuantity(
  allocation: Pick<Allocation, "quantity">,
  requests: Pick<AllocationRequest, "status" | "quantityRequested">[],
): number {
  return Math.min(MAX_BOTTLES_PER_REQUEST, bottlesRemaining(allocation, requests));
}

/** Tier display name used in eligibility copy. Mirrors the customer-facing
 *  names in `TIERS` without a cyclic import. */
function tierDisplayName(tier: Tier): string {
  switch (tier) {
    case Tier.gold:
      return "Collector";
    case Tier.reserve:
      return "Reserve";
    case Tier.platinum:
      return "Private Vault";
    case Tier.black:
      return "Estate";
  }
}

// ── Lifecycle helpers ────────────────────────────────────────────────────

/**
 * Allowed next-statuses for a request given its current status. Used by
 * the admin server actions to reject transitions the UI should never
 * surface but a crafted request could attempt.
 */
export function canTransitionRequest(
  from: AllocationRequestStatus,
  to: AllocationRequestStatus,
): boolean {
  switch (from) {
    case AllocationRequestStatus.submitted:
      return (
        to === AllocationRequestStatus.accepted ||
        to === AllocationRequestStatus.declined ||
        to === AllocationRequestStatus.cancelled
      );
    case AllocationRequestStatus.accepted:
      return (
        to === AllocationRequestStatus.fulfilled ||
        to === AllocationRequestStatus.cancelled
      );
    case AllocationRequestStatus.declined:
    case AllocationRequestStatus.cancelled:
    case AllocationRequestStatus.fulfilled:
      return false;
  }
}

export function isOpenForRequests(
  allocation: Pick<Allocation, "status" | "closesAt">,
  now: Date = new Date(),
): boolean {
  return (
    allocation.status === AllocationStatus.published && now <= allocation.closesAt
  );
}
