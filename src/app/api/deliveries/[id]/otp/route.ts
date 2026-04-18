/**
 * POST /api/deliveries/[id]/otp (feature #51)
 *
 * Verify the step-up OTP and advance status → `otp_verified`. Mirrors the PIN
 * route's shape: per-delivery rate limit with `failMode: "closed"`,
 * attempt counter durable on the row, `otp_failed`/`otp_verified` events.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  ConfirmOtpBodySchema,
  UuidSchema,
  parseOr400,
  parsePathParamOr404,
} from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { canTransition, generateDriverToken, verifyOtp } from "@/lib/delivery";
import { logger } from "@/lib/logger";

const OTP_ATTEMPT_WINDOW_MIN = 15;
const OTP_ATTEMPT_LIMIT = 5;

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

  const rate = await checkRateLimit(`otp-attempt:${id}`, {
    limit: OTP_ATTEMPT_LIMIT,
    windowMs: OTP_ATTEMPT_WINDOW_MIN * 60_000,
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
  const parsed = parseOr400(ConfirmOtpBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const { otp } = parsed.data;

  const delivery = await prisma.deliveryRequest.findFirst({
    where: { id, memberId },
    select: {
      id: true,
      status: true,
      otpRequired: true,
      otpSalt: true,
      otpHash: true,
      otpAttempts: true,
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

  if (!delivery.otpRequired) {
    return NextResponse.json({ error: "otp_not_required" }, { status: 400 });
  }

  if (!canTransition(delivery.status, "otp_verified", { otpRequired: delivery.otpRequired })) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  if (!delivery.otpSalt || !delivery.otpHash) {
    // Row was created with otpRequired but has no secret — caller never hit
    // /otp/send. Surface a clean 409 so the UI can prompt them to send first.
    return NextResponse.json({ error: "otp_not_sent" }, { status: 409 });
  }

  const ok = verifyOtp(otp, delivery.otpSalt, delivery.otpHash);
  if (!ok) {
    const remaining = Math.max(0, rate.remaining);
    try {
      await prisma.$transaction([
        prisma.deliveryRequest.update({
          where: { id },
          data: { otpAttempts: { increment: 1 } },
        }),
        prisma.deliveryEvent.create({
          data: {
            deliveryRequestId: id,
            actor: "member",
            type: "otp_failed",
          },
        }),
      ]);
    } catch (err) {
      logger.error("[api/deliveries/otp] miss log failed", err, {
        memberId,
        deliveryId: id,
      });
    }
    return NextResponse.json(
      { error: "invalid_otp", remainingAttempts: remaining },
      { status: 401 },
    );
  }

  // otp_verified is the terminal member-side transition for OTP-required
  // deliveries — hand the driverToken out here so the door-side URL becomes
  // reachable. Non-OTP deliveries receive their token one step earlier in
  // /api/deliveries/[id]/address.
  const driverToken = generateDriverToken();

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id },
        data: {
          status: "otp_verified",
          otpVerifiedAt: new Date(),
          driverToken,
        },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: id,
          actor: "member",
          type: "otp_verified",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "otp_verified" });
  } catch (err) {
    logger.error("[api/deliveries/otp] advance failed", err, {
      memberId,
      deliveryId: id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
