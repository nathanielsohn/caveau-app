/**
 * Liv-ex live pricing client (feature #39).
 *
 * Liv-ex is the fine-wine exchange; their REST API returns a Mid-Price
 * ("MP") per LWIN (London International Vintners Network) code, which is
 * the 7-digit-plus-vintage identifier Liv-ex uses for a specific bottle
 * and vintage. The daily sync job at `/api/cron/livex-sync` asks this
 * client for a quote per wine and writes the result into WineValuation
 * rows with `source = "liv-ex"`.
 *
 * Design notes:
 *
 *   1. Graceful failure is the whole point. If LIVEX_API_KEY is unset,
 *      `fetchLivexPrice` returns null immediately and the sync job
 *      decides what to do — there's no throw, because an upstream outage
 *      should never crash a page render. Seeded demo data keeps rendering
 *      exactly as it does today when the key is absent.
 *
 *   2. We identify wines by `(producer, name, vintage)` because Caveau's
 *      schema doesn't store LWINs. The client hits Liv-ex's wine-search
 *      endpoint to resolve a match and then fetches the Mid-Price. A
 *      missing match also returns null, not a throw.
 *
 *   3. Fetch uses a hard 5s timeout via AbortController. Liv-ex is
 *      usually < 500ms but we'd rather drop one wine's update than stall
 *      the whole cron invocation if they're having a bad day.
 *
 *   4. Prices are returned in USD even though Liv-ex quotes GBP natively.
 *      The client converts via the rate returned from the same payload
 *      so we never fan out a second request per wine. When GBP/USD is
 *      missing we fall through and return null rather than guess.
 *
 * Reference: https://www.liv-ex.com/wp-content/uploads/2021/03/Liv-ex-API-Overview.pdf
 */

import { env } from "./env";
import { logger } from "./logger";

const DEFAULT_BASE_URL = "https://api.liv-ex.com/v1";
const FETCH_TIMEOUT_MS = 5_000;

export interface LivexQuote {
  /** Mid-Price in USD, rounded to 2 decimal places. */
  priceUsd: number;
  /** ISO timestamp returned by Liv-ex for the quote. */
  quotedAt: string;
  /** LWIN identifier resolved for this wine, stored for debugging. */
  lwin: string;
}

interface LivexSearchResponse {
  wines?: Array<{
    lwin?: string;
    producer?: string;
    wine?: string;
    vintage?: number;
  }>;
}

interface LivexMidPriceResponse {
  lwin?: string;
  currency?: string;
  /** Mid-Price as a number in the quoted currency. */
  mid_price?: number;
  /** GBP → USD rate returned alongside the quote. */
  usd_rate?: number;
  quoted_at?: string;
}

/** True when the client has enough config to talk to Liv-ex. */
export function isLivexConfigured(): boolean {
  return Boolean(env.LIVEX_API_KEY);
}

function baseUrl(): string {
  return env.LIVEX_BASE_URL ?? DEFAULT_BASE_URL;
}

async function livexFetch(path: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
      // SSRF defense-in-depth. LIVEX_BASE_URL is operator-controlled so
      // redirect-chasing to an attacker-picked host requires a DNS
      // compromise, but refusing redirects outright eliminates the class.
      redirect: "error",
    });
    if (!res.ok) {
      logger.warn("[livex] non-2xx response", {
        path,
        status: res.status,
      });
      return null;
    }
    return (await res.json()) as unknown;
  } catch (err) {
    logger.warn("[livex] fetch failed", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a Caveau wine row to its Liv-ex LWIN by hitting their
 * wine-search endpoint. Returns null when no match is found or the API
 * is unreachable.
 */
async function resolveLwin(
  params: { producer: string; name: string; vintage: number },
  apiKey: string,
): Promise<string | null> {
  const query = new URLSearchParams({
    producer: params.producer,
    wine: params.name,
    vintage: String(params.vintage),
  });
  const json = (await livexFetch(
    `/wines/search?${query.toString()}`,
    apiKey,
  )) as LivexSearchResponse | null;
  const match = json?.wines?.[0];
  return match?.lwin ?? null;
}

/**
 * Fetch a current Mid-Price quote for a wine. Returns null on any
 * failure (no key, API error, no match, unknown currency). Callers
 * should treat null as "keep the last known price" and never throw.
 */
export async function fetchLivexPrice(params: {
  producer: string;
  name: string;
  vintage: number;
}): Promise<LivexQuote | null> {
  const apiKey = env.LIVEX_API_KEY;
  if (!apiKey) return null;

  const lwin = await resolveLwin(params, apiKey);
  if (!lwin) return null;

  const json = (await livexFetch(
    `/prices/mid/${encodeURIComponent(lwin)}`,
    apiKey,
  )) as LivexMidPriceResponse | null;

  if (!json || typeof json.mid_price !== "number") return null;

  // Liv-ex quotes in GBP by default; convert to USD using the rate
  // returned alongside the quote. If either the currency or the rate is
  // missing / unexpected, return null — a guessed FX rate is worse than
  // falling back to the last known price.
  let priceUsd: number;
  const currency = (json.currency ?? "GBP").toUpperCase();
  if (currency === "USD") {
    priceUsd = json.mid_price;
  } else if (currency === "GBP" && typeof json.usd_rate === "number") {
    priceUsd = json.mid_price * json.usd_rate;
  } else {
    logger.warn("[livex] unsupported currency", { currency, lwin });
    return null;
  }

  return {
    priceUsd: Math.round(priceUsd * 100) / 100,
    quotedAt: json.quoted_at ?? new Date().toISOString(),
    lwin,
  };
}
