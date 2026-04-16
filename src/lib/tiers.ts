import { Tier } from "@prisma/client";

/**
 * Public tier names shown in onboarding, settings, and marketing.
 *
 * There are four public tiers but only three values in the `Tier` enum
 * (gold / platinum / black) — adding a fourth would require a migration,
 * so Reserve is intentionally sales-gated ("Contact us") and has no
 * self-serve DB mapping. The three self-serve tiers map 1:1 onto the
 * existing enum.
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
  hurricaneProtection: HurricaneCoverage;
  includedServices: string[];
  /** Null for tiers that can't be self-selected from onboarding. */
  dbTier: Tier | null;
}

export const TIERS: readonly TierSpec[] = [
  {
    slug: "collector",
    name: "Collector",
    description:
      "Your entry into the Caveau vault — a personal locker with 24/7 Sentinel monitoring.",
    priceMonthlyUsd: 29,
    priceDisplay: "$29/mo",
    hurricaneProtection: "addon",
    includedServices: [
      "One 32-bottle climate-controlled locker",
      "24/7 Sentinel environmental monitoring",
      "Custody & condition reports on demand",
      "Email alerts on threshold breaches",
    ],
    dbTier: Tier.gold,
  },
  {
    slug: "reserve",
    name: "Reserve",
    description:
      "For growing collections that need flexible capacity and hands-on intake support.",
    priceMonthlyUsd: null,
    priceDisplay: "Contact us",
    hurricaneProtection: "addon",
    includedServices: [
      "Multiple lockers scaled to your holdings",
      "Dedicated intake + inventory assistance",
      "Priority alerts routed to phone and email",
      "Quarterly portfolio review",
    ],
    dbTier: null,
  },
  {
    slug: "private_vault",
    name: "Private Vault",
    description:
      "Investment-grade storage with quarterly valuations and Hurricane Protection included.",
    priceMonthlyUsd: 349,
    priceDisplay: "$349/mo",
    hurricaneProtection: "included",
    includedServices: [
      "Up to three 32-bottle lockers",
      "Quarterly Liv-ex valuations",
      "Investment portfolio dashboard",
      "Hurricane Emergency Collection Protection",
      "Priority Sentinel alerts",
    ],
    dbTier: Tier.platinum,
  },
  {
    slug: "estate",
    name: "Estate",
    description:
      "Private members club. White-glove custody for estates, trusts, and institutional collections.",
    priceMonthlyUsd: 999,
    priceDisplay: "$999/mo",
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
  },
] as const;

/**
 * Tiers that can be chosen from the onboarding wizard — everything with a
 * concrete DB mapping and published price. Reserve is excluded because it's
 * sales-quoted.
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
