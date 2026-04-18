/**
 * POST /api/deliveries/[id]/pin (feature #51)
 *
 * Member-side PIN verification. On success, status → `pin_entered` and
 * `pinVerifiedAt` stamps. On miss, `pinAttempts` increments and a
 * `pin_failed` event is appended. The rate limiter enforces the real
 * ceiling (5/15min per delivery, failMode: "closed"); `pinAttempts`
 * powers the admin audit surface and the UI's "X attempts remaining" hint.
 *
 * Biometric must be verified first — returns 412 with
 * `{ error: "biometric_required" }` otherwise so the UI can route back
 * to step 1.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  ConfirmPinBodySchema,
  UuidSchema,
  parseOr400,
  parsePathParamOr404,
} from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { canTransition, verifyPin } from "@/lib/delivery";
import { logger } from "@/lib/logger";

const PIN_ATTEMPT_WINDOW_MIN = 15;
const PIN_ATTEMPT_LIMIT = 5;

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

  const rate = await checkRateLimit(`pin-attempt:${id}`, {
    limit: PIN_ATTEMPT_LIMIT,
    windowMs: PIN_ATTEMPT_WINDOW_MIN * 60_000,
    failMode: "closed",
  });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many attempts", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(ConfirmPinBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const { pin } = parsed.data;

  const delivery = await prisma.deliveryRequest.findFirst({
    where: { id, memberId },
    select: {
      id: true,
      status: true,
      isBiometricVerified: true,
      otpRequired: true,
      pinSalt: true,
      pinHash: true,
      pinAttempts: true,
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

  if (!delivery.isBiometricVerified) {
    return NextResponse.json(
      { error: "biometric_required" },
      { status: 412 },
    );
  }

  if (!canTransition(delivery.status, "pin_entered", { otpRequired: delivery.otpRequired })) {
    return NextResponse.json(
      { error: "invalid_state" },
      { status: 409 },
    );
  }

  const ok = verifyPin(pin, delivery.pinSalt, delivery.pinHash);
  if (!ok) {
    const remaining = Math.max(0, rate.remaining);
    try {
      await prisma.$transaction([
        prisma.deliveryRequest.update({
          where: { id },
          data: { pinAttempts: { increment: 1 } },
        }),
        prisma.deliveryEvent.create({
          data: {
            deliveryRequestId: id,
            actor: "member",
            type: "pin_failed",
          },
        }),
      ]);
    } catch (err) {
      logger.error("[api/deliveries/pin] miss log failed", err, {
        memberId,
        deliveryId: id,
      });
    }
    return NextResponse.json(
      { error: "invalid_pin", remainingAttempts: remaining },
      { status: 401 },
    );
  }

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id },
        data: {
          status: "pin_entered",
          pinVerifiedAt: new Date(),
        },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: id,
          actor: "member",
          type: "pin_entered",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "pin_entered" });
  } catch (err) {
    logger.error("[api/deliveries/pin] advance failed", err, {
      memberId,
      deliveryId: id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
