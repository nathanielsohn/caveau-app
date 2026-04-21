import { Tier } from "@prisma/client";

/**
 * Public tier names shown in onboarding, settings, and marketing.
 *
 * The Tier enum gained a `reserve` value in migration 0032 so all four
 * public tiers map 1:1 onto the DB. Before #54 Reserve was sales-gated
 * with `dbTier: null`, which required the wizard to render it as a
 * contact-card rather than a selectable tier.
 */
export type TierSlug = "collector" | "reserve" | "private_vault" | "estate";

export type HurricaneCoverage = "included" | "addon" | "not_available";

export interface TierSpec {
  slug: TierSlug;
  name: string;
  description: string;
  /** Null when pricing is sales-quoted rather than published. */
  priceMonthlyUsd: number | null;
  priceDisplay: string;
  /**
   * Founding-window monthly price per tier. Equal to `priceMonthlyUsd`
   * for Collector (no discount per deck slide 11); discounted for every
   * other self-serve tier. Null mirrors `priceMonthlyUsd` when a tier
   * has no published price (never today; guard against future tier shape
   * changes).
   */
  foundingMonthlyUsd: number | null;
  foundingDisplay: string;
  hurricaneProtection: HurricaneCoverage;
  includedServices: string[];
  /** Null for tiers that can't be self-selected from onboarding. */
  dbTier: Tier | null;
  /**
   * Sentinel locker sensors included at this tier (feature #58 / #59).
   * Collector requires purchase; Reserve 1, Private Vault 2, Estate 2
   * per the pitch deck slide 8. The admin fleet page reads this to
   * attribute bundled-vs-purchased on a device without a separate flag.
   */
  bundledSentinels: number;
  /** Bottle Probes included at this tier. Estate only today. */
  bundledBottleProbes: number;
}

export const TIERS: readonly TierSpec[] = [
  {
    slug: "collector",
    name: "Collector",
    description:
      "Your entry into the Caveau vault — a personal locker with 24/7 Sentinel monitoring.",
    priceMonthlyUsd: 29,
    priceDisplay: "$29/mo",
    foundingMonthlyUsd: 29,
    foundingDisplay: "$29/mo",
    hurricaneProtection: "addon",
    includedServices: [
      "One 32-bottle climate-controlled locker",
      "24/7 Sentinel environmental monitoring",
      "Caveau Custody & Condition Reports on demand",
      "Email alerts on threshold breaches",
    ],
    dbTier: Tier.gold,
    bundledSentinels: 0,
    bundledBottleProbes: 0,
  },
  {
    slug: "reserve",
    name: "Reserve",
    description:
      "For growing collections that need flexible capacity and hands-on intake support.",
    priceMonthlyUsd: 149,
    priceDisplay: "$149/mo",
    foundingMonthlyUsd: 119,
    foundingDisplay: "$119/mo",
    hurricaneProtection: "addon",
    includedServices: [
      "Multiple lockers scaled to your holdings",
      "Dedicated intake + inventory assistance",
      "Priority alerts routed to phone and email",
      "Quarterly portfolio review",
    ],
    dbTier: Tier.reserve,
    bundledSentinels: 1,
    bundledBottleProbes: 0,
  },
  {
    slug: "private_vault",
    name: "Private Vault",
    description:
      "Investment-grade storage with quarterly valuations and Hurricane Protection included.",
    priceMonthlyUsd: 349,
    priceDisplay: "$349/mo",
    foundingMonthlyUsd: 299,
    foundingDisplay: "$299/mo",
    hurricaneProtection: "included",
    includedServices: [
      "Up to three 32-bottle lockers",
      "Quarterly Liv-ex valuations",
      "Investment portfolio dashboard",
      "Hurricane Emergency Collection Protection",
      "Priority Sentinel alerts",
    ],
    dbTier: Tier.platinum,
    bundledSentinels: 2,
    bundledBottleProbes: 0,
  },
  {
    slug: "estate",
    name: "Estate",
    description:
      "Private members club. White-glove custody for estates, trusts, and institutional collections.",
    priceMonthlyUsd: 999,
    priceDisplay: "$999/mo",
    foundingMonthlyUsd: 849,
    foundingDisplay: "$849/mo",
    hurricaneProtection: "included",
    includedServices: [
      "Unlimited locker capacity",
      "Dedicated concierge + bonded courier",
      "Insurance-grade custody documentation",
      "Auction / broker handoff package",
      "Home Cellar Program enrollment",
      "Hurricane Emergency Collection Protection",
    ],
    dbTier: Tier.black,
    bundledSentinels: 2,
    bundledBottleProbes: 1,
  },
] as const;

/**
 * Tiers that can be chosen from the onboarding wizard — everything with a
 * concrete DB mapping. All four public tiers have a DB tier since
 * migration 0032, so this is effectively `TIERS` today; kept as a filter
 * so a future sales-gated tier can still opt out with `dbTier: null`.
 */
export const SELF_SERVE_TIERS: readonly TierSpec[] = TIERS.filter(
  (t): t is TierSpec & { dbTier: Tier } => t.dbTier !== null,
);

/**
 * Resolve the public tier spec for a given DB Tier value. Falls back to
 * Collector if the column holds an unmapped value (shouldn't happen, but
 * keeps the settings page from crashing on stale data).
 */
export function tierSpecForDbTier(tier: Tier): TierSpec {
  return (
    TIERS.find((t) => t.dbTier === tier) ??
    TIERS.find((t) => t.slug === "collector")!
  );
}

// ── Founding Member pricing (#54) ──────────────────────────────────────

/**
 * Hard-coded founding window cutoff. Tied to the Q3 2027 launch: anyone
 * who completes onboarding before this date gets founding pricing locked
 * for life. The cutoff itself is a design call (not a DB row) so the
 * moment it passes, no new rows get the flag — but existing founding
 * members keep their locked rate because `foundingMember` is persisted
 * on the Member row at lock time.
 */
export const FOUNDING_WINDOW_END = new Date("2027-09-30T23:59:59.000Z");

export function isFoundingWindowOpen(now: Date = new Date()): boolean {
  return now <= FOUNDING_WINDOW_END;
}

/**
 * The bundle shown on the founding-member card. These are display-only
 * — the welcome appraisal (#61) and allocation access (#60) are still
 * on the roadmap, so this surface lists the promise, not the fulfillment.
 */
export const FOUNDING_BENEFITS: readonly string[] = [
  "Price locked for life with continuous membership",
  "90-day Private Vault trial",
  "Welcome appraisal by our head sommelier",
  "Founding Circle status in the member directory",
  "Day 1 access to private allocations & limited releases",
] as const;

/**
 * The price a member actually sees on their bill, given their tier and
 * whether they locked in the founding rate. Used by settings + onboarding
 * so the number shown is always consistent with what we'd charge.
 */
export function effectivePriceForMember(
  tier: TierSpec,
  foundingMember: boolean,
): { priceMonthlyUsd: number | null; priceDisplay: string } {
  if (foundingMember && tier.foundingMonthlyUsd !== null) {
    return {
      priceMonthlyUsd: tier.foundingMonthlyUsd,
      priceDisplay: tier.foundingDisplay,
    };
  }
  return {
    priceMonthlyUsd: tier.priceMonthlyUsd,
    priceDisplay: tier.priceDisplay,
  };
}

/**
 * Monthly savings a founding member gets on a given tier. Returns 0 when
 * the tier has no founding discount (Collector) or no published price.
 */
export function foundingSavingsUsd(tier: TierSpec): number {
  if (tier.priceMonthlyUsd === null || tier.foundingMonthlyUsd === null) {
    return 0;
  }
  return Math.max(0, tier.priceMonthlyUsd - tier.foundingMonthlyUsd);
}
