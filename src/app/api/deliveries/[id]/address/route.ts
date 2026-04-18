/**
 * POST /api/deliveries/[id]/address (feature #51)
 *
 * Confirm / update the delivery address snapshot and advance the status to
 * `address_confirmed`. In practice only valid from `pin_entered` per
 * `canTransition`.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  ConfirmAddressBodySchema,
  UuidSchema,
  parseOr400,
  parsePathParamOr404,
} from "@/lib/schemas";
import { canTransition } from "@/lib/delivery";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const memberId = session.user.id;

  const { id: rawId } = await params;
  const idResult = parsePathParamOr404(UuidSchema, rawId);
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(ConfirmAddressBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const { address } = parsed.data;

  const delivery = await prisma.deliveryRequest.findFirst({
    where: { id, memberId },
    select: {
      id: true,
      status: true,
      otpRequired: true,
      expiresAt: true,
    },
  });
  if (!delivery) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    delivery.expiresAt.getTime() < Date.now() &&
    delivery.status !== "completed" &&
    delivery.status !== "cancelled" &&
    delivery.status !== "expired"
  ) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  if (!canTransition(delivery.status, "address_confirmed", { otpRequired: delivery.otpRequired })) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id },
        data: {
          deliveryAddressLine1: address.line1,
          deliveryAddressLine2: address.line2 ?? null,
          deliveryCity: address.city,
          deliveryState: address.state.toUpperCase(),
          deliveryPostalCode: address.postalCode,
          status: "address_confirmed",
        },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: id,
          actor: "member",
          type: "address_confirmed",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "address_confirmed" });
  } catch (err) {
    logger.error("[api/deliveries/address] update failed", err, {
      memberId,
      deliveryId: id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
