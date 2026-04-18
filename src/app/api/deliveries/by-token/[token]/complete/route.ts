/**
 * POST /api/deliveries/by-token/[token]/complete (feature #51)
 *
 * Driver-side. Finalizes the delivery. Verifies the submitted `photoKey`
 * was minted for this specific delivery (mirrors the wine-image prefix
 * check in src/app/api/wines/route.ts), persists it, and advances
 * `id_scanned → completed`. Appends staff `photo_captured` + `completed`
 * events.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DriverCompleteBodySchema,
  parseOr400,
} from "@/lib/schemas";
import {
  DRIVER_TOKEN_PATTERN,
  loadDeliveryByDriverToken,
} from "@/lib/delivery";
import { logger } from "@/lib/logger";

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
  const { delivery } = bundle;

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
  if (delivery.status !== "id_scanned") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(DriverCompleteBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const { photoKey } = parsed.data;

  // Defense-in-depth: the key must belong to this delivery's own prefix.
  // Prevents a compromised client from submitting a photo key that points
  // at another delivery's S3 prefix (or a generic wines/ path) and having
  // the handoff record point at the wrong object.
  const expectedPrefix = `deliveries/${delivery.id}/`;
  if (!photoKey.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id: delivery.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          handoffPhotoKey: photoKey,
        },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: delivery.id,
          actor: "staff",
          type: "photo_captured",
          payload: { photoKey },
        },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: delivery.id,
          actor: "staff",
          type: "completed",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "completed" });
  } catch (err) {
    logger.error("[api/deliveries/by-token/complete] failed", err, {
      deliveryId: delivery.id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
