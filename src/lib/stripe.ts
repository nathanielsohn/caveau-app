/**
 * Stripe billing helpers (feature #27).
 *
 * Mirrors the app's "graceful failure when unconfigured" pattern:
 * - If STRIPE_SECRET_KEY (or required price IDs) are unset, helpers
 *   return null/typed errors instead of throwing, so the UI can render a
 *   disabled state and server actions can return friendly messages.
 *
 * Stripe client is lazily instantiated so importing this module in code
 * paths that don't touch billing (or during `next build`) is safe.
 */

import { Tier } from "@prisma/client";
import Stripe from "stripe";
import { env } from "./env";
import { tierSpecForDbTier } from "./tiers";

export const STRIPE_MEMBER_ID_METADATA_KEY = "memberId";

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cachedClient) {
    cachedClient = new Stripe(key, {
      // Set an explicit API version so behavior doesn't silently drift.
      apiVersion: "2026-03-25.dahlia",
      typescript: true,
    });
  }
  return cachedClient;
}

function tierUsesSameFoundingPrice(tier: Tier): boolean {
  const spec = tierSpecForDbTier(tier);
  if (spec.priceMonthlyUsd === null || spec.foundingMonthlyUsd === null) return false;
  return spec.priceMonthlyUsd === spec.foundingMonthlyUsd;
}

function membershipPriceIdForMemberTier(
  tier: Tier,
  foundingMember: boolean,
): string | null {
  const standard =
    tier === Tier.gold
      ? env.STRIPE_PRICE_COLLECTOR
      : tier === Tier.reserve
        ? env.STRIPE_PRICE_RESERVE
        : tier === Tier.platinum
          ? env.STRIPE_PRICE_PRIVATE_VAULT
          : tier === Tier.black
            ? env.STRIPE_PRICE_ESTATE
            : null;

  if (!foundingMember) return standard ?? null;

  const founding =
    tier === Tier.gold
      ? env.STRIPE_PRICE_COLLECTOR_FOUNDING
      : tier === Tier.reserve
        ? env.STRIPE_PRICE_RESERVE_FOUNDING
        : tier === Tier.platinum
          ? env.STRIPE_PRICE_PRIVATE_VAULT_FOUNDING
          : tier === Tier.black
            ? env.STRIPE_PRICE_ESTATE_FOUNDING
            : null;

  if (founding) return founding;

  // Collector has no founding discount — allow it to fall back to the
  // standard price ID if a dedicated founding price isn't created.
  if (tierUsesSameFoundingPrice(tier)) return standard ?? null;

  return null;
}

export type StripeCheckoutPrices =
  | {
      ok: true;
      membershipPriceId: string;
      storagePriceId: string;
    }
  | {
      ok: false;
      code:
        | "stripe_not_configured"
        | "stripe_prices_not_configured"
        | "stripe_storage_price_not_configured";
      error: string;
    };

export function selectStripeCheckoutPricesForMember(input: {
  tier: Tier;
  foundingMember: boolean;
}): StripeCheckoutPrices {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      code: "stripe_not_configured",
      error: "Billing is not configured for this environment.",
    };
  }

  const membershipPriceId = membershipPriceIdForMemberTier(
    input.tier,
    input.foundingMember,
  );
  if (!membershipPriceId) {
    return {
      ok: false,
      code: "stripe_prices_not_configured",
      error: "Billing is not fully configured (missing membership price).",
    };
  }

  const storagePriceId = env.STRIPE_PRICE_STORAGE_PER_SLOT;
  if (!storagePriceId) {
    return {
      ok: false,
      code: "stripe_storage_price_not_configured",
      error: "Billing is not fully configured (missing storage price).",
    };
  }

  return { ok: true, membershipPriceId, storagePriceId };
}

export function stripeBillingEnabledForUi(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}
