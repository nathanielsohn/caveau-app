/**
 * Daily Liv-ex price sync (feature #39).
 *
 * Vercel cron hits this route on a schedule (see `vercel.json` → crons).
 * Auth is a shared-secret Bearer token in the Authorization header — Vercel
 * cron sends `Authorization: Bearer $CRON_SECRET` automatically when you set
 * `CRON_SECRET` in the project env. The route also allows manual invocation
 * from an operator with curl when they supply the same header.
 *
 * Behavior:
 *
 *   - When `LIVEX_API_KEY` is unset, the handler short-circuits with
 *     `{ status: "skipped" }` and updates nothing. Seeded demo data keeps
 *     rendering unchanged, which is exactly what we want in dev and on any
 *     environment without the real integration wired up.
 *
 *   - For each active (in-cellar) wine, it asks `fetchLivexPrice` for a
 *     fresh quote. On success it writes a new WineValuation row with
 *     `source = "liv-ex"`, updates `wines.current_value` (only when the
 *     new quote is the latest by date — same rule as manual valuations
 *     in `wine/[id]/actions.ts`), and stamps `wines.last_valuation_sync_at`.
 *
 *   - On a per-wine failure (API down, no match, wrong currency) we log
 *     a warning and move on. The prior `current_value` and the most
 *     recent WineValuation row are left in place, which is the "fallback
 *     to last known price" requirement — rendering code never sees a gap.
 *
 *   - The whole sync is best-effort: even if every wine fails we return
 *     200 with a counts breakdown so cron history stays green. Use the
 *     `skipped` / `failed` counts to detect a degraded upstream.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { fetchLivexPrice, isLivexConfigured } from "@/lib/livex";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Keep the sync bounded so one invocation can't run for half an hour on a
// cold Lambda. The Vercel Hobby plan caps function duration at 60s; we
// leave headroom for the final DB writes.
export const maxDuration = 60;

// Hard cap on wines processed per invocation. Well above any realistic
// demo collection; a production deploy would page through the set.
const MAX_WINES_PER_RUN = 500;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function authorized(req: NextRequest): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) {
    // Whitelist the environments where it's safe to skip the secret.
    // Anything else (staging, preview, an unrecognized NODE_ENV) MUST set
    // CRON_SECRET — we never want a misconfigured staging env to expose the
    // sync route just because NODE_ENV happens to not be "production".
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
  }
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();

  if (!isLivexConfigured()) {
    logger.info("[cron/livex-sync] skipped — LIVEX_API_KEY unset");
    return NextResponse.json({ status: "skipped", reason: "not_configured" });
  }

  const startedAt = Date.now();

  const wines = await prisma.wine.findMany({
    where: { status: "in_cellar" },
    select: {
      id: true,
      name: true,
      producer: true,
      vintage: true,
    },
    take: MAX_WINES_PER_RUN,
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const wine of wines) {
    let quote;
    try {
      quote = await fetchLivexPrice({
        producer: wine.producer,
        name: wine.name,
        vintage: wine.vintage,
      });
    } catch (err) {
      // fetchLivexPrice shouldn't throw, but belt-and-braces: a single
      // bad wine must never poison the whole run.
      failed += 1;
      logger.warn("[cron/livex-sync] fetch threw", {
        wineId: wine.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!quote) {
      skipped += 1;
      continue;
    }

    try {
      const quoteDate = new Date(quote.quotedAt);
      const priceDecimal = new Prisma.Decimal(quote.priceUsd);

      await prisma.$transaction(async (tx) => {
        // Upsert-style: the unique key on (wineId, date, source) lets us
        // re-run the sync within the same day without duplicating rows.
        await tx.wineValuation.upsert({
          where: {
            wineId_date_source: {
              wineId: wine.id,
              date: quoteDate,
              source: "liv-ex",
            },
          },
          create: {
            wineId: wine.id,
            date: quoteDate,
            source: "liv-ex",
            price: priceDecimal,
          },
          update: {
            price: priceDecimal,
          },
        });

        // Only overwrite currentValue when this quote is the latest row
        // for the wine — mirrors the backdate guard in the manual
        // valuation action in src/app/wine/[id]/page.tsx.
        const latest = await tx.wineValuation.findFirst({
          where: { wineId: wine.id },
          orderBy: [{ date: "desc" }, { id: "desc" }],
          select: { date: true, price: true },
        });

        const updates: { currentValue?: Prisma.Decimal; lastValuationSyncAt: Date } = {
          lastValuationSyncAt: new Date(),
        };
        if (latest && latest.date.getTime() === quoteDate.getTime()) {
          updates.currentValue = priceDecimal;
        }

        await tx.wine.update({
          where: { id: wine.id },
          data: updates,
        });
      });

      updated += 1;
    } catch (err) {
      failed += 1;
      logger.error("[cron/livex-sync] write failed", err, {
        wineId: wine.id,
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  logger.info("[cron/livex-sync] complete", {
    updated,
    skipped,
    failed,
    total: wines.length,
    durationMs,
  });

  return NextResponse.json({
    status: "ok",
    updated,
    skipped,
    failed,
    total: wines.length,
    durationMs,
  });
}
