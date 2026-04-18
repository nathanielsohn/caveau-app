/**
 * AI Advisor chat API route (feature #50).
 *
 * POST /api/advisor/chat
 *   Body: { messages: Array<{ role: "user" | "assistant", content: string }> }
 *   Returns: text/event-stream with one JSON object per SSE `data:` line.
 *
 * Behavior:
 *
 *   1. Authenticates the request via `getServerAuth()`. No session → 401.
 *   2. Enforces a per-member rate limit of 20 requests/hour via the shared
 *      limiter. On breach → 429 with Retry-After.
 *   3. Short-circuits with 503 `{ error: "advisor_not_configured" }` when
 *      ANTHROPIC_API_KEY is unset — same graceful-failure pattern as
 *      `src/lib/livex.ts`. The rest of the app keeps working.
 *   4. Validates the body against `AdvisorChatBodySchema`.
 *   5. Fetches `getMemberPortfolio()` + `getTierDetails()` once up-front to
 *      build the member context block. These are the same tool functions
 *      the model can call later — priming the context block with them
 *      means "how's my collection?" greetings don't cost a tool round trip.
 *   6. Runs the tool-use loop server-side against
 *      `ADVISOR_TOOL_DEFINITIONS` (see `src/lib/advisor-dispatch.ts`).
 *      Caps at 6 tool-use turns to bound cost.
 *   7. Streams the model's final text back as SSE events so the UI can
 *      render progressively.
 *
 * Prompt caching: the system prompt + tool definitions are cached via
 * `cache_control: { type: "ephemeral" }` on the last system block. Tools
 * render before system, so the same breakpoint caches both. Multi-turn
 * conversations within 5 minutes hit the cache. The stable prefix order
 * (tools → system → messages) is exactly what
 * `shared/prompt-caching.md` recommends.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { AdvisorChatBodySchema, parseOr400 } from "@/lib/schemas";
import {
  ADVISOR_TOOL_DEFINITIONS,
  dispatchTool,
} from "@/lib/advisor-dispatch";
import { buildAdvisorSystemPrompt } from "@/lib/advisor-system-prompt";
import {
  getMemberPortfolio,
  getTierDetails,
  getActiveAlerts,
} from "@/lib/advisor-tools";
import { tierSpecForDbTier } from "@/lib/tiers";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Streaming responses against a multi-turn tool loop can easily run past
// the default Lambda timeout. The Hobby-tier ceiling is 60s; bump to the
// plan max so the first-run tool fan-out has room.
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const MAX_TOOL_ITERATIONS = 6;

const RATE_LIMIT_POLICY = {
  limit: 20,
  windowMs: 60 * 60 * 1000,
} as const;

function sseEncode(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "advisor_not_configured" },
      { status: 503 },
    );
  }

  const memberId = session.user.id;
  const requestId = getRequestId();

  // Per-member rate limit — 20 requests/hour. Per-IP would be wrong here
  // because multiple members can share a household NAT, and per-member
  // matches the member's actual budget for advisor calls.
  const limit = await checkRateLimit(`advisor-chat:${memberId}`, {
    limit: RATE_LIMIT_POLICY.limit,
    windowMs: RATE_LIMIT_POLICY.windowMs,
  });
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseOr400(AdvisorChatBodySchema, body);
  if (!parsed.ok) return parsed.response;

  // Prime the member context block. These three tool calls all touch the
  // member's own data so they're safe to run unconditionally — and doing
  // them here means a greeting like "hello" doesn't cost a tool round
  // trip. If any of them throws (DB hiccup), log and continue with an
  // empty summary rather than 500ing the whole chat.
  const memberName = session.user.name ?? "Member";
  let tierSlug = tierSpecForDbTier(session.user.tier).slug;
  let portfolioSummary:
    | {
        bottleCount: number;
        lockerCount: number;
        totalValueUsd: number;
        activeAlerts: number;
      }
    | undefined;
  try {
    const [portfolio, tier, alerts] = await Promise.all([
      getMemberPortfolio(),
      getTierDetails(),
      getActiveAlerts(),
    ]);
    const lockerIds = new Set(
      portfolio.wines.map((w) => w.lockerNumber).filter((n) => n != null),
    );
    portfolioSummary = {
      bottleCount: portfolio.wines.length,
      lockerCount: lockerIds.size,
      totalValueUsd: portfolio.totals.totalValueUsd,
      activeAlerts: alerts.length,
    };
    tierSlug = tier.slug as typeof tierSlug;
  } catch (err) {
    logger.warn("[advisor-chat] member context prefetch failed", {
      requestId,
      memberId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const systemPrompt = buildAdvisorSystemPrompt({
    memberName,
    tierSlug,
    portfolioSummary,
  });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Convert the client's simple {role, content: string} shape into the
  // richer MessageParam format Anthropic expects. The chat UI stores
  // text-only messages, so each turn wraps as a single text block.
  const messages: Anthropic.MessageParam[] = parsed.data.messages.map((m) => ({
    role: m.role,
    content: [{ type: "text", text: m.content }],
  }));

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  // Drive the tool-use loop on a detached promise so we can return the
  // Response immediately. Everything that could error is wrapped here so
  // the stream is always closed and an SSE error event is emitted before
  // the pipe goes away.
  void (async () => {
    // Accumulate usage across every iteration so we can log a single line
    // with the full request's token spend. Lets us price advisor traffic
    // per-member and per-tier later without re-parsing stream events.
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreate = 0;
    let totalCacheRead = 0;
    let toolCalls = 0;
    let toolErrors = 0;
    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [
            {
              type: "text",
              text: systemPrompt,
              // Cache the stable prefix (tools + system). Multi-turn
              // conversations within 5 minutes hit the cache, so each
              // follow-up question costs only the delta tokens. Anything
              // volatile (timestamps, request IDs) would invalidate this
              // — keep the prompt builder deterministic.
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: ADVISOR_TOOL_DEFINITIONS,
          messages,
        });

        // Forward text deltas to the client as they stream.
        stream.on("text", (delta) => {
          void writer.write(sseEncode({ type: "text", text: delta }));
        });

        const message = await stream.finalMessage();
        totalInput += message.usage.input_tokens ?? 0;
        totalOutput += message.usage.output_tokens ?? 0;
        totalCacheCreate += message.usage.cache_creation_input_tokens ?? 0;
        totalCacheRead += message.usage.cache_read_input_tokens ?? 0;

        // Append the assistant turn so subsequent requests see it. Pass
        // the full content array (not just text) — the SDK requires
        // tool_use blocks in the assistant message for tool_result
        // blocks in the next user message to match up.
        messages.push({ role: "assistant", content: message.content });

        if (message.stop_reason !== "tool_use") {
          // end_turn | max_tokens | stop_sequence | pause_turn | refusal
          // — anything that isn't a tool call is terminal for this
          // request. The model's text already streamed; nothing to do.
          break;
        }

        // Execute each tool_use block. Tools are independent so we run
        // them in parallel, but with allSettled so one tool's throw
        // doesn't cancel the others — the model still needs a
        // tool_result for every tool_use block or the next turn errors.
        const toolUses = message.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        toolCalls += toolUses.length;
        const settled = await Promise.allSettled(
          toolUses.map(async (tu) => {
            void writer.write(
              sseEncode({ type: "tool_use", name: tu.name }),
            );
            return dispatchTool(tu.name, tu.input);
          }),
        );
        const toolResults = settled.map((outcome, i) => {
          const tu = toolUses[i];
          if (outcome.status === "rejected") {
            toolErrors += 1;
            logger.error(
              "[advisor-chat] tool threw",
              outcome.reason,
              { requestId, memberId, tool: tu.name },
            );
            return {
              type: "tool_result" as const,
              tool_use_id: tu.id,
              is_error: true,
              content: "Tool execution failed.",
            };
          }
          if (outcome.value.ok) {
            return {
              type: "tool_result" as const,
              tool_use_id: tu.id,
              content: JSON.stringify(outcome.value.result),
            };
          }
          toolErrors += 1;
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            is_error: true,
            content: outcome.value.error,
          };
        });

        messages.push({ role: "user", content: toolResults });

        if (iteration === MAX_TOOL_ITERATIONS - 1) {
          // Safety cap — if the model tries to keep calling tools past
          // the ceiling, end the turn with a terse notice. Prevents a
          // runaway loop from burning through the Anthropic budget.
          void writer.write(
            sseEncode({
              type: "text",
              text:
                "\n\n(I've reached the research cap for this question. " +
                "If you'd like me to go deeper, ask a follow-up.)",
            }),
          );
        }
      }

      void writer.write(sseEncode({ type: "done" }));
    } catch (err) {
      logger.error("[advisor-chat] stream failed", err, { requestId, memberId });
      try {
        void writer.write(
          sseEncode({
            type: "error",
            message:
              err instanceof Anthropic.APIError
                ? `Anthropic error (${err.status ?? "unknown"})`
                : "Advisor is temporarily unavailable.",
          }),
        );
      } catch {
        // Swallow — the writer is already closed.
      }
    } finally {
      // One structured line per chat request summarizing Anthropic spend
      // and tool activity. Lets us bucket cost per member/tier offline
      // without running a second pass over the streaming events.
      logger.info("[advisor-chat] usage", {
        requestId,
        memberId,
        tier: tierSlug,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheCreateTokens: totalCacheCreate,
        cacheReadTokens: totalCacheRead,
        toolCalls,
        toolErrors,
      });
      try {
        await writer.close();
      } catch {
        // Writer may already be closed if an earlier write threw.
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
