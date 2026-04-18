/**
 * POST /api/deliveries/[id]/otp/send (feature #51)
 *
 * Rotate the OTP on the delivery row and email it to the member. The code is
 * regenerated on every send so older values invalidate immediately. 60s
 * cooldown is enforced by looking at the most recent `otp_sent` DeliveryEvent
 * — durable across serverless instances, no in-memory state needed (same
 * cutoff-on-recent-event pattern as src/lib/notify-alert.ts).
 *
 * Returns 200 regardless of whether the email actually sent, so a caller
 * can't probe whether SES is wired. The log line still records the miss.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema, parsePathParamOr404 } from "@/lib/schemas";
import { generateOtp, hashOtp } from "@/lib/delivery";
import { sendDeliveryOtpEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const COOLDOWN_MS = 60_000;

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
      otpRequired: true,
      expiresAt: true,
      member: { select: { name: true, email: true } },
      items: {
        select: {
          wine: { select: { currentValue: true } },
        },
      },
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
  if (delivery.status !== "address_confirmed") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const recent = await prisma.deliveryEvent.findFirst({
    where: {
      deliveryRequestId: id,
      type: "otp_sent",
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent) {
    const retryAfter = Math.max(
      1,
      Math.ceil((recent.createdAt.getTime() + COOLDOWN_MS - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "otp_cooldown", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const otp = generateOtp();
  const { salt: otpSalt, hash: otpHash } = hashOtp(otp);

  try {
    await prisma.$transaction([
      prisma.deliveryRequest.update({
        where: { id },
        data: { otpSalt, otpHash, otpAttempts: 0 },
      }),
      prisma.deliveryEvent.create({
        data: {
          deliveryRequestId: id,
          actor: "system",
          type: "otp_sent",
        },
      }),
    ]);
  } catch (err) {
    logger.error("[api/deliveries/otp/send] rotate failed", err, {
      memberId,
      deliveryId: id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  const totalValueUsd = delivery.items.reduce(
    (acc, it) => acc + Number(it.wine.currentValue),
    0,
  );

  if (delivery.member?.email) {
    // Fire-and-forget on the email side so a slow SES call can't hold the
    // response. The helper is already non-throwing and returns a boolean.
    void sendDeliveryOtpEmail(
      { name: delivery.member.name, email: delivery.member.email },
      {
        code: otp,
        totalValueUsd,
        bottleCount: delivery.items.length,
        expiresAt: delivery.expiresAt,
      },
    );
  }

  return NextResponse.json({ sent: true });
}
