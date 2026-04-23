/**
 * Stripe webhook (feature #27).
 *
 * Receives subscription lifecycle events and syncs Stripe state → Member
 * billing fields. Signature-verified (STRIPE_WEBHOOK_SECRET) and written
 * to be idempotent so retries are safe.
 *
 * This route is exempted from auth middleware in src/middleware.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getStripeClient, STRIPE_MEMBER_ID_METADATA_KEY } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { syncStorageQuantityForMember } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

function json(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status });
}

function readMemberIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const raw = metadata?.[STRIPE_MEMBER_ID_METADATA_KEY];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function resolveStripeId(
  v: string | { id: string } | null | undefined,
): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

async function findMemberIdForStripeEvent(input: {
  metadata: Stripe.Metadata | null | undefined;
  customerId: string | null;
}): Promise<string | null> {
  const fromMeta = readMemberIdFromMetadata(input.metadata);
  if (fromMeta) return fromMeta;
  if (!input.customerId) return null;
  const member = await prisma.member.findFirst({
    where: { stripeCustomerId: input.customerId },
    select: { id: true },
  });
  return member?.id ?? null;
}

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return json(503, { error: "stripe_not_configured" });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json(400, { error: "missing_signature" });
  }

  let event: Stripe.Event;
  const rawBody = Buffer.from(await req.arrayBuffer());
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logger.warn("[stripe/webhook] signature verification failed", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return json(400, { error: "bad_signature" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = resolveStripeId(session.customer);
      const subscriptionId = resolveStripeId(session.subscription);
      const memberId = await findMemberIdForStripeEvent({
        metadata: session.metadata,
        customerId,
      });

      if (!memberId) {
        logger.warn("[stripe/webhook] checkout completed missing memberId", {
          eventId: event.id,
          customerId,
          subscriptionId,
        });
        return json(200, { status: "ignored", reason: "missing_member" });
      }

      await prisma.member.update({
        where: { id: memberId },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      // Best-effort: ensure the storage line item quantity matches the
      // current reserved slot count (lockers may have changed since the
      // session was created).
      await syncStorageQuantityForMember(memberId);

      return json(200, { status: "ok" });
    }

    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = resolveStripeId(sub.customer);
      const memberId = await findMemberIdForStripeEvent({
        metadata: sub.metadata,
        customerId,
      });

      if (!memberId) {
        logger.warn("[stripe/webhook] subscription event missing memberId", {
          eventId: event.id,
          type: event.type,
          subscriptionId: sub.id,
          customerId,
        });
        return json(200, { status: "ignored", reason: "missing_member" });
      }

      const storagePrice = env.STRIPE_PRICE_STORAGE_PER_SLOT;
      const storageItemId = storagePrice
        ? sub.items.data.find((item) => item.price.id === storagePrice)?.id ??
          null
        : null;

      const periodEndSeconds =
        sub.items.data.length > 0
          ? Math.min(...sub.items.data.map((item) => item.current_period_end))
          : null;

      await prisma.member.update({
        where: { id: memberId },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          stripeSubscriptionStatus: sub.status,
          stripeCurrentPeriodEnd: periodEndSeconds
            ? new Date(periodEndSeconds * 1000)
            : null,
          stripeStorageItemId: storageItemId,
        },
      });

      // Best-effort: subscription item quantities can drift if a staff
      // member manually edits a member's lockers. Keep storage in sync.
      await syncStorageQuantityForMember(memberId);

      return json(200, { status: "ok" });
    }

    return json(200, { status: "ignored", type: event.type });
  } catch (err) {
    // Stripe retries on non-2xx. Return 200 so we don't thrash, but log
    // loudly so miswires are visible.
    logger.error("[stripe/webhook] handler failed", err, {
      eventId: event.id,
      type: event.type,
    });
    return json(200, { status: "error_logged" });
  }
}
