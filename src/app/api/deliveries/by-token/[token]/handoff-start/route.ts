/**
 * POST /api/deliveries/by-token/[token]/handoff-start (feature #51)
 *
 * Driver-side. Advances `address_confirmed|otp_verified → handoff_started`
 * and appends a staff `handoff_started` event. Token is the 256-bit
 * driverToken set on the DeliveryRequest when the member-side ladder
 * finishes. No auth — the token itself is the bearer credential.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DRIVER_TOKEN_PATTERN,
  canTransition,
  loadDeliveryByDriverToken,
} from "@/lib/delivery";
import { logger } from "@/lib/logger";

export async function POST(
  _request: Request,
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

  if (
    !canTransition(delivery.status, "handoff_started", {
      otpRequired: delivery.otpRequired,
    })
  ) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id: delivery.id },
        data: { status: "handoff_started" },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: delivery.id,
          actor: "staff",
          type: "handoff_started",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "handoff_started" });
  } catch (err) {
    logger.error("[api/deliveries/by-token/handoff-start] failed", err, {
      deliveryId: delivery.id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
