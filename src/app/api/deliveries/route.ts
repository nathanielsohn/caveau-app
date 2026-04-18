/**
 * POST /api/deliveries (feature #51)
 *
 * Creates a DeliveryRequest + items + initial `requested` event. Generates a
 * 4-digit PIN — returned ONCE in the response and never again (the hash is
 * stored; the plaintext is discarded after send). Generates a 6-digit OTP
 * only when the combined currentValue of the items crosses the $2K step-up
 * threshold (see `isOtpRequired` in src/lib/delivery.ts). The OTP is not
 * returned by this route — it's delivered out-of-band via
 * `POST /api/deliveries/[id]/otp/send`.
 *
 * Rate-limited per-member at 5/60s. Member-scope on every wineId via
 * `prisma.wine.findMany`; a cross-member id yields 400 without leaking
 * which id failed.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { CreateDeliveryRequestBodySchema, parseOr400 } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  generatePin,
  hashPin,
  generateOtp,
  hashOtp,
  isOtpRequired,
  defaultExpiresAt,
} from "@/lib/delivery";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const memberId = session.user.id;

  const rate = await checkRateLimit(`deliveries:create:${memberId}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(CreateDeliveryRequestBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const { wineIds, address } = parsed.data;

  // Every wineId must belong to the caller. Dedup first so a request with
  // duplicate ids doesn't silently pass the count check.
  const uniqueWineIds = Array.from(new Set(wineIds));
  const ownedWines = await prisma.wine.findMany({
    where: { id: { in: uniqueWineIds }, memberId },
    select: { id: true },
  });
  if (ownedWines.length !== uniqueWineIds.length) {
    return NextResponse.json(
      { error: "Some wines not found" },
      { status: 400 },
    );
  }

  const pin = generatePin();
  const { salt: pinSalt, hash: pinHash } = hashPin(pin);

  const otpRequired = await isOtpRequired(uniqueWineIds, memberId);
  let otpSalt: string | null = null;
  let otpHash: string | null = null;
  if (otpRequired) {
    const otp = generateOtp();
    const hashed = hashOtp(otp);
    otpSalt = hashed.salt;
    otpHash = hashed.hash;
    // The plaintext OTP is NOT returned here. It ships to the member's email
    // via /otp/send. Generating it up-front means the row is internally
    // consistent from creation; the email call is a later step the UI drives.
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const delivery = await tx.deliveryRequest.create({
        data: {
          memberId,
          status: "requested",
          pinSalt,
          pinHash,
          otpRequired,
          otpSalt,
          otpHash,
          deliveryAddressLine1: address.line1,
          deliveryAddressLine2: address.line2 ?? null,
          deliveryCity: address.city,
          deliveryState: address.state.toUpperCase(),
          deliveryPostalCode: address.postalCode,
          expiresAt: defaultExpiresAt(),
        },
      });
      await tx.deliveryRequestItem.createMany({
        data: uniqueWineIds.map((wineId) => ({
          deliveryRequestId: delivery.id,
          wineId,
        })),
      });
      await tx.deliveryEvent.create({
        data: {
          deliveryRequestId: delivery.id,
          actor: "member",
          type: "requested",
        },
      });
      return delivery;
    });

    return NextResponse.json(
      {
        id: created.id,
        status: created.status,
        otpRequired: created.otpRequired,
        expiresAt: created.expiresAt,
        pin,
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[api/deliveries] create failed", err, { memberId });
    return NextResponse.json(
      { error: "Failed to create delivery" },
      { status: 500 },
    );
  }
}
