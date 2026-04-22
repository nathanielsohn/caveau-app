/**
 * Tool dispatcher for the AI Advisor (feature #50).
 *
 * The chat route receives a `tool_use` content block from Claude, calls
 * `dispatchTool(name, input)` to execute the corresponding function from
 * `advisor-tools.ts`, and feeds the result (or a structured error) back
 * to the model as a `tool_result` block.
 *
 * Isolating dispatch from the route has three benefits:
 *
 *   1. The seven tool → function mappings stay in one place. The route
 *      doesn't need to know about Zod schemas, auth errors, or tool
 *      result shapes — it just passes the model's tool_use.name through.
 *
 *   2. `advisor_tool_definitions` (the Anthropic tool schemas) live next
 *      to the functions they dispatch to, so adding or changing a tool
 *      is a one-file edit.
 *
 *   3. Unit-testable without a live HTTP request. Tests import
 *      `dispatchTool` directly and verify routing, error surfacing, and
 *      param validation without spinning up the chat route.
 *
 * Error contract: every failure path returns `{ error: string }` rather
 * than throwing. The caller maps that back into a `tool_result` with
 * `is_error: true`, which lets Claude decide to try a different tool or
 * decline the question — exactly the behavior the advisor spec asks for
 * when a tool returns nothing. Stack traces never leak to the model or
 * the client.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  AdvisorAuthError,
  getMemberPortfolio,
  getLivexPriceHistory,
  getActiveAlerts,
  getCCRList,
  getTierDetails,
  getWineDetail,
  getLivexBenchmark,
  getPortfolioVsLivex,
  getExitSignals,
  getInsuranceSavingsEstimate,
  getMyAllocations,
  getMyAppraisals,
  getMyAcquisitions,
} from "@/lib/advisor-tools";
import {
  AdvisorWineIdParamSchema,
  AdvisorBenchmarkParamSchema,
  AdvisorAllocationsParamSchema,
  AdvisorAppraisalsParamSchema,
  AdvisorAcquisitionsParamSchema,
} from "@/lib/schemas";
import { logger } from "@/lib/logger";

export type DispatchResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/**
 * Anthropic tool schemas for every member-scoped advisor tool. These get
 * passed verbatim to `messages.create({ tools: ADVISOR_TOOL_DEFINITIONS })`.
 *
 * `input_schema` follows JSON Schema shape — keep it lean (Claude reads it
 * every turn) and deterministic so prompt caching doesn't invalidate on
 * each request.
 */
export const ADVISOR_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "getMemberPortfolio",
    description:
      "Return the authenticated member's full collection with per-bottle value, purchase basis, CAGR, drink window, locker assignment, investment-grade tier, and disposition state — plus portfolio totals (total value, cost basis, YTD change). Use this as the default first call for any portfolio-level question. Takes no arguments; member is resolved server-side from the session.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getLivexPriceHistory",
    description:
      "Return the Liv-ex-sourced valuation history for a single wine the member owns. Use this to confirm momentum or recent price trajectory before making an exit recommendation. Throws 'Wine not found' if the wineId doesn't belong to the session member.",
    input_schema: {
      type: "object",
      properties: {
        wineId: {
          type: "string",
          description:
            "The internal UUID of a wine the member owns, as returned by getMemberPortfolio.",
        },
      },
      required: ["wineId"],
      additionalProperties: false,
    },
  },
  {
    name: "getActiveAlerts",
    description:
      "Return currently-active Sentinel alerts across every locker the member owns, each with the latest sensor reading (temperature, humidity, vibration) and the thresholds that were breached. Use this for any question about environmental conditions or 'should I worry about X'. Takes no arguments.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getCCRList",
    description:
      "Return every Caveau Custody & Condition Report (CCR) issued for the member's bottles, including CCR number, bottle, monitoring window, data-integrity hash, verification URL, and revoked status. Use this for 'which bottles have a CCR ready for consignment' or 'what's the CCR for the Pétrus' questions. Takes no arguments.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getTierDetails",
    description:
      "Return the member's current tier spec: published name (Collector / Reserve / Private Vault / Estate), monthly price, included services, hurricane-protection coverage, and description. Use this for tier-benefit, pricing, and insurance-context questions. Takes no arguments.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getWineDetail",
    description:
      "Return one bottle's full detail — last 10 valuations across all sources, every CCR, every disposition entry, and the latest sensor reading for its locker. Use this when the member references a specific bottle ('the '05 Haut-Brion', 'my Pétrus', 'bottle V-22') and you need more than getMemberPortfolio gives.",
    input_schema: {
      type: "object",
      properties: {
        wineId: {
          type: "string",
          description:
            "The internal UUID of a wine the member owns, as returned by getMemberPortfolio.",
        },
      },
      required: ["wineId"],
      additionalProperties: false,
    },
  },
  {
    name: "getLivexBenchmark",
    description:
      "Return the Liv-ex Fine Wine 100 index history with latest value, YTD change, and 1-year change. Use this for 'how am I positioned vs the Liv-ex 100' or similar benchmarking questions. Public market data — not scoped to the member. Accepts an optional `since` date to narrow the returned point series.",
    input_schema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          description:
            "Optional ISO date (YYYY-MM-DD) or RFC 3339 datetime. Points earlier than this date are excluded. Defaults to the last 24 months.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getPortfolioVsLivex",
    description:
      "Return the member's portfolio performance versus the Liv-ex Fine Wine 100 over the YTD window (or trailing 12 months when YTD has fewer than three snapshots). Both series are indexed to 100 at the anchor so comparisons read as percent. `portfolioChangePct` / `livexChangePct` are the two endpoints, `deltaPct` is the portfolio-minus-index edge in percentage points. Use this as the first call for 'how am I doing vs the Liv-ex 100?' — it collapses what would otherwise be two tool calls plus manual math into one structured answer. Takes no arguments.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getExitSignals",
    description:
      "Return all open exit signals across the member's collection. Each signal contains a rationale, a reason ('drink_window_closing' | 'peak_momentum' | 'dual'), a strength ('moderate' | 'strong'), a price snapshot, and a recommended consignment target range. Use this as the first call for 'what's my best exit opportunity right now?' — surface the rationale verbatim instead of inventing reasoning. Takes no arguments.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getInsuranceSavingsEstimate",
    description:
      "Return the member's estimated annual insurance savings from storing with Caveau — a savings range in USD, the tier-scaled discount band (15–35%), the baseline premium assumption, the four named partner carriers (PURE, Chubb, AXA XL, Berkley One), and the specific storage-discipline inputs a carrier would underwrite. Use this for 'how much am I saving on insurance?', 'which carriers work with Caveau?', or tier-benefit questions that touch insurance. Static estimate (not a real quote); surface the range and the tier ladder rather than inventing a point number. Takes no arguments.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getMyAllocations",
    description:
      "Return private allocations and limited releases available to the authenticated member. Each row includes producer, wine, vintage, quantity remaining, price per bottle, tier eligibility, founding-only flag, open/close dates, eligibility decision for the session member, and the member's own request state (submitted / accepted / fulfilled / declined / none). Use this for 'what allocations am I eligible for?', 'what's my request status on the DRC?', or 'which releases close this week?'. The optional `status` filter selects `eligible_open` (default — currently open and the member qualifies), `requested` (any allocation the member has ever requested), or `all` (every open release, including tier-locked ones so you can explain the ladder).",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["eligible_open", "requested", "all"],
          description:
            "Which slice of allocations to return. Defaults to `eligible_open`.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getMyAppraisals",
    description:
      "Return the member's appraisal history — insurance / estate / tax / donation / gift / personal valuation documents. Distinct from CCRs: a CCR attests to custody conditions for one bottle; an appraisal attests to dollar value of the collection (or a scoped subset) at a point in time. Each row returns status, purpose, basis, bottle count, total basis in USD, appraisal number (when completed), and a public `/verify/appraisal/<hash>` URL for completed documents. Also returns a `welcomeState` — `available` (founding member who can still claim their free welcome appraisal), `claimed` (already requested or completed), or `ineligible` (not founding). Use this for 'do I have an insurance appraisal on file?', 'what's the total basis on my last appraisal?', 'can I still claim my welcome appraisal?', or 'give me the verify link for CAV-APR-2026-0001'. Optional `status` filter selects `open` (default — submitted or in-progress), `completed`, or `all`.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "completed", "all"],
          description:
            "Which slice of the appraisal list to return. Defaults to `open`.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getMyAcquisitions",
    description:
      "Return the member's concierge sourcing requests (feature #62). Each acquisition captures a bottle the member asked Caveau to hunt down — producer, optional wine name + vintage (exact or range), region, varietal, quantity, optional budget cap, and a free-text note. Returns status (requested / sourcing / fulfilled / declined / cancelled), the staff-authored sourcing note, a working-quote total (`estimatedTotalUsd`) if staff have shared one, the final `memberPriceUsd` once fulfilled, the source (Liv-ex / broker / auction / Caveau private network), and the wine IDs written into the member's collection on fulfillment. Does NOT return Caveau's cost basis or margin — those are admin-only reporting fields. Use this for 'what's the status on my 2015 Margaux hunt?', 'what acquisitions do I have in progress?', or 'did my Sassicaia come through?'. Optional `status` filter: `open` (default — requested or sourcing), `fulfilled`, or `all`.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "fulfilled", "all"],
          description:
            "Which slice of the acquisitions list to return. Defaults to `open`.",
        },
      },
      additionalProperties: false,
    },
  },
];

/**
 * Dispatch a tool call. Returns a discriminated `{ ok: true, result }` or
 * `{ ok: false, error }` — never throws. The chat route converts either
 * into a `tool_result` block with the appropriate `is_error` flag.
 */
export async function dispatchTool(
  name: string,
  input: unknown,
): Promise<DispatchResult> {
  try {
    switch (name) {
      case "getMemberPortfolio":
        return { ok: true, result: await getMemberPortfolio() };

      case "getLivexPriceHistory": {
        const params = AdvisorWineIdParamSchema.parse(input);
        return { ok: true, result: await getLivexPriceHistory(params) };
      }

      case "getActiveAlerts":
        return { ok: true, result: await getActiveAlerts() };

      case "getCCRList":
        return { ok: true, result: await getCCRList() };

      case "getTierDetails":
        return { ok: true, result: await getTierDetails() };

      case "getWineDetail": {
        const params = AdvisorWineIdParamSchema.parse(input);
        return { ok: true, result: await getWineDetail(params) };
      }

      case "getLivexBenchmark": {
        const params = AdvisorBenchmarkParamSchema.parse(input ?? {});
        return { ok: true, result: await getLivexBenchmark(params) };
      }

      case "getPortfolioVsLivex":
        return { ok: true, result: await getPortfolioVsLivex() };

      case "getExitSignals":
        return { ok: true, result: await getExitSignals() };

      case "getInsuranceSavingsEstimate":
        return { ok: true, result: await getInsuranceSavingsEstimate() };

      case "getMyAllocations": {
        const params = AdvisorAllocationsParamSchema.parse(input ?? {});
        return { ok: true, result: await getMyAllocations(params) };
      }

      case "getMyAppraisals": {
        const params = AdvisorAppraisalsParamSchema.parse(input ?? {});
        return { ok: true, result: await getMyAppraisals(params) };
      }

      case "getMyAcquisitions": {
        const params = AdvisorAcquisitionsParamSchema.parse(input ?? {});
        return { ok: true, result: await getMyAcquisitions(params) };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    if (err instanceof AdvisorAuthError) {
      // An auth error here means the session evaporated mid-request or a
      // jailbreak attempt slipped a tool call past the route-level check.
      // Surface it as a structured error so Claude declines the turn
      // rather than guessing an answer from training data.
      return { ok: false, error: "authentication_required" };
    }
    const message = err instanceof Error ? err.message : String(err);
    // Log with the tool name so we can correlate failures when
    // investigating — but the message going back to the model stays short
    // and doesn't leak stack traces or query internals.
    logger.warn("[advisor-dispatch] tool threw", {
      tool: name,
      error: message,
    });
    return { ok: false, error: message };
  }
}
