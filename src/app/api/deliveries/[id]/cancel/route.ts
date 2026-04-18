/**
 * POST /api/deliveries/[id]/cancel (feature #51)
 *
 * Cancel any non-terminal DeliveryRequest. Sets `status = "cancelled"`,
 * stamps `cancelledAt`, and appends a `cancelled` event.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema, parsePathParamOr404 } from "@/lib/schemas";
import { logger } from "@/lib/logger";

const TERMINAL = new Set(["completed", "cancelled", "expired"] as const);

export async function POST(
  _request: Request,
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

  const delivery = await prisma.deliveryRequest.findFirst({
    where: { id, memberId },
    select: { id: true, status: true },
  });
  if (!delivery) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (TERMINAL.has(delivery.status as "completed" | "cancelled" | "expired")) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id },
        data: { status: "cancelled", cancelledAt: new Date() },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: id,
          actor: "member",
          type: "cancelled",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "cancelled" });
  } catch (err) {
    logger.error("[api/deliveries/cancel] update failed", err, {
      memberId,
      deliveryId: id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
