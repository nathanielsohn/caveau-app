/**
 * POST /api/deliveries/[id]/biometric (feature #51)
 *
 * Demo-mode biometric gate. Flips `isBiometricVerified` to true and appends a
 * `biometric_verified` event. Idempotent — re-posting when the flag is
 * already true is a 200 no-op without a duplicate event. Status does NOT
 * advance here; biometric is a precondition on the PIN step, not a state.
 *
 * A future WebAuthn swap would write a real credential id into a new column
 * without touching this flag or this route's contract.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema, parsePathParamOr404 } from "@/lib/schemas";
import { logger } from "@/lib/logger";

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
    select: {
      id: true,
      status: true,
      isBiometricVerified: true,
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

  if (delivery.isBiometricVerified) {
    return NextResponse.json({ ok: true, isBiometricVerified: true });
  }

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id },
        data: { isBiometricVerified: true },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: id,
          actor: "member",
          type: "biometric_verified",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, isBiometricVerified: true });
  } catch (err) {
    logger.error("[api/deliveries/biometric] update failed", err, {
      memberId,
      deliveryId: id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
