/**
 * POST /api/deliveries/by-token/[token]/id-scan (feature #51)
 *
 * Driver-side. Driver enters the name + DOB read off the recipient's ID.
 * Server matches the name case-insensitively against the member's
 * AuthorizedRecipient registry, cross-checks the DOB exactly against the
 * registered value, and enforces the Florida DABT >= 21 age floor before
 * advancing `handoff_started → id_scanned`.
 *
 * Failure modes:
 *   - name or DOB mismatch → 401 `{ error: "no_recipient_match" }`
 *     (same error for both so a probe can't tell which field failed)
 *   - registered recipient under 21 → 403 `{ error: "underage" }`
 *
 * Rate-limited 5/15min per delivery, failClosed — same shape as the PIN
 * attempt limiter, keyed on delivery id so rotating driver tokens can't
 * dodge the ceiling.
 *
 * We intentionally do NOT persist an `id_scan_failed` event on miss: the
 * rate-limiter already caps abuse, and flooding the audit log with
 * typo-driven misses creates noise without signal.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  IdScanBodySchema,
  parseOr400,
} from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  DRIVER_TOKEN_PATTERN,
  isLegalAge,
  loadDeliveryByDriverToken,
} from "@/lib/delivery";
import { logger } from "@/lib/logger";

const ID_SCAN_WINDOW_MIN = 15;
const ID_SCAN_LIMIT = 5;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!DRIVER_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bundle = await loadDeliveryByDriverToken(token);
  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { delivery, recipients } = bundle;

  const rate = await checkRateLimit(`id-scan-attempt:${delivery.id}`, {
    limit: ID_SCAN_LIMIT,
    windowMs: ID_SCAN_WINDOW_MIN * 60_000,
    failMode: "closed",
  });
  if (!rate.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rate.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "Too many attempts", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const now = Date.now();
  const terminal =
    delivery.status === "completed" ||
    delivery.status === "cancelled" ||
    delivery.status === "expired";

  if (delivery.expiresAt.getTime() < now && !terminal) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }
  if (terminal) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  if (delivery.status !== "handoff_started") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(IdScanBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const { name, dateOfBirth } = parsed.data;

  const needle = name.toLowerCase();
  const match = recipients.find(
    (r) =>
      r.name.toLowerCase().includes(needle) && r.dateOfBirth === dateOfBirth,
  );
  if (!match) {
    return NextResponse.json(
      { error: "no_recipient_match" },
      { status: 401 },
    );
  }

  if (!isLegalAge(new Date(`${match.dateOfBirth}T00:00:00Z`))) {
    return NextResponse.json({ error: "underage" }, { status: 403 });
  }

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id: delivery.id },
        data: {
          status: "id_scanned",
          scannedRecipientName: name,
        },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: delivery.id,
          actor: "staff",
          type: "id_scanned",
          payload: { matchedRecipientId: match.id },
        },
      }),
    ]);
    return NextResponse.json({
      ok: true,
      status: "id_scanned",
      matchedRecipientName: match.name,
    });
  } catch (err) {
    logger.error("[api/deliveries/by-token/id-scan] failed", err, {
      deliveryId: delivery.id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
