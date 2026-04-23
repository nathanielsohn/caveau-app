"use server";

import { z } from "zod";
import { SentinelEventType, SentinelModel } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import {
  getStripeClient,
  selectStripeCheckoutPricesForMember,
  STRIPE_MEMBER_ID_METADATA_KEY,
} from "@/lib/stripe";
import { getReservedSlotCountForMember } from "@/lib/billing";

const VALID_SEVERITIES = ["info", "warning", "critical"] as const;
type ValidSeverity = (typeof VALID_SEVERITIES)[number];

export interface AlertPrefsState {
  /** Bumped on every submit so the client wrapper can detect "this submit's
   *  result is fresh" even when the user re-submits the same payload twice
   *  in a row (otherwise React's strict-equality check on state would
   *  swallow the duplicate). */
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
}

export const INITIAL_ALERT_PREFS_STATE: AlertPrefsState = {
  submittedAt: null,
  ok: false,
  error: null,
};

export async function updateAlertPreferences(
  _prevState: AlertPrefsState,
  formData: FormData,
): Promise<AlertPrefsState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    if (!session?.user?.id) {
      return { submittedAt: now, ok: false, error: "Not authenticated" };
    }

    const enabledRaw = formData.get("emailAlertsEnabled");
    const severityRaw = formData.get("emailAlertSeverity");
    const cooldownRaw = formData.get("emailAlertCooldownMin");

    // Checkbox: form submits "on" when checked, nothing when unchecked.
    const emailAlertsEnabled = enabledRaw === "on" || enabledRaw === "true";

    const severity =
      typeof severityRaw === "string" &&
      VALID_SEVERITIES.includes(severityRaw as ValidSeverity)
        ? (severityRaw as ValidSeverity)
        : "warning";

    let cooldownMin = 30;
    if (typeof cooldownRaw === "string" && cooldownRaw.length > 0) {
      const parsed = parseInt(cooldownRaw, 10);
      if (Number.isFinite(parsed)) {
        // Clamp to a sane range: 0 (no cooldown) to 24 hours.
        cooldownMin = Math.max(0, Math.min(1440, parsed));
      }
    }

    await prisma.member.update({
      where: { id: session.user.id },
      data: {
        emailAlertsEnabled,
        emailAlertSeverity: severity,
        emailAlertCooldownMin: cooldownMin,
      },
    });

    revalidatePath("/settings");
    return { submittedAt: now, ok: true, error: null };
  } catch (e) {
    logger.error("updateAlertPreferences failed", e, {
      action: "updateAlertPreferences",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not save preferences. Try again in a moment.",
    };
  }
}

// ── Billing (feature #27) ────────────────────────────────────────────

export type BillingActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

function getAppBaseUrlFromHeaders(): string | null {
  if (env.NEXTAUTH_URL) return env.NEXTAUTH_URL.replace(/\/$/, "");
  const h = headers();
  const origin = h.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");
  return null;
}

function hasActiveStripeMembership(status: string | null | undefined): boolean {
  // Stripe statuses: active, trialing, past_due, unpaid, canceled,
  // incomplete, incomplete_expired, paused.
  return (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "unpaid" ||
    status === "incomplete"
  );
}

export async function createCheckoutSessionAction(): Promise<BillingActionResult> {
  try {
    const session = await getServerAuth();
    if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

    const member = await prisma.member.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        tier: true,
        foundingMember: true,
        stripeCustomerId: true,
        stripeSubscriptionStatus: true,
      },
    });
    if (!member) return { ok: false, error: "Member not found" };

    if (hasActiveStripeMembership(member.stripeSubscriptionStatus)) {
      return { ok: false, error: "Membership is already active. Use Manage billing." };
    }

    const prices = selectStripeCheckoutPricesForMember({
      tier: member.tier,
      foundingMember: member.foundingMember,
    });
    if (!prices.ok) return { ok: false, error: prices.error };

    const reservedSlots = await getReservedSlotCountForMember(member.id);
    if (reservedSlots <= 0) {
      return {
        ok: false,
        error:
          "No locker storage is reserved for your account yet. Contact support to assign a locker before starting membership.",
      };
    }

    const stripe = getStripeClient();
    if (!stripe) return { ok: false, error: "Billing is not configured." };

    const baseUrl = getAppBaseUrlFromHeaders();
    if (!baseUrl) {
      return {
        ok: false,
        error:
          "Could not determine this app's URL. Set NEXTAUTH_URL in the environment.",
      };
    }

    let customerId = member.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: member.email,
        name: member.name,
        metadata: { [STRIPE_MEMBER_ID_METADATA_KEY]: member.id },
      });
      customerId = customer.id;
      await prisma.member.update({
        where: { id: member.id },
        data: { stripeCustomerId: customerId },
      });
      revalidatePath("/settings");
    } else {
      // Ensure metadata is present for webhook correlation.
      try {
        await stripe.customers.update(customerId, {
          metadata: { [STRIPE_MEMBER_ID_METADATA_KEY]: member.id },
        });
      } catch (err) {
        logger.warn("stripe.customers.update metadata failed", {
          action: "createCheckoutSessionAction",
          memberId: member.id,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: member.id,
      allow_promotion_codes: true,
      metadata: { [STRIPE_MEMBER_ID_METADATA_KEY]: member.id },
      subscription_data: {
        metadata: { [STRIPE_MEMBER_ID_METADATA_KEY]: member.id },
      },
      line_items: [
        { price: prices.membershipPriceId, quantity: 1 },
        { price: prices.storagePriceId, quantity: reservedSlots },
      ],
      success_url: `${baseUrl}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings?billing=cancelled`,
    });

    if (!checkout.url) {
      return { ok: false, error: "Could not start checkout. Try again." };
    }
    return { ok: true, url: checkout.url };
  } catch (e) {
    logger.error("createCheckoutSessionAction failed", e, {
      action: "createCheckoutSessionAction",
    });
    return { ok: false, error: "Could not start checkout. Try again in a moment." };
  }
}

export async function createBillingPortalAction(): Promise<BillingActionResult> {
  try {
    const session = await getServerAuth();
    if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

    const member = await prisma.member.findUnique({
      where: { id: session.user.id },
      select: { id: true, stripeCustomerId: true },
    });
    if (!member) return { ok: false, error: "Member not found" };

    if (!member.stripeCustomerId) {
      return { ok: false, error: "No billing profile on file yet." };
    }

    const stripe = getStripeClient();
    if (!stripe) return { ok: false, error: "Billing is not configured." };

    const baseUrl = getAppBaseUrlFromHeaders();
    if (!baseUrl) {
      return {
        ok: false,
        error:
          "Could not determine this app's URL. Set NEXTAUTH_URL in the environment.",
      };
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: member.stripeCustomerId,
      return_url: `${baseUrl}/settings`,
    });

    if (!portal.url) {
      return { ok: false, error: "Could not open billing portal. Try again." };
    }
    return { ok: true, url: portal.url };
  } catch (e) {
    logger.error("createBillingPortalAction failed", e, {
      action: "createBillingPortalAction",
    });
    return { ok: false, error: "Could not open billing portal. Try again in a moment." };
  }
}

// ── Bottle Probe pairing (#59) ─────────────────────────────────────────

const PairBottleProbeSchema = z.object({
  deviceId: z.string().uuid(),
  // Empty string from the form's "unpair" option clears the wineId.
  wineId: z
    .string()
    .uuid()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

/**
 * Pair (or unpair) a Bottle Probe with one of the caller's in-cellar
 * wines. Member-side counterpart to the admin `reassignDeviceAction`
 * — scoped to the caller's own devices and wines so the `/settings`
 * card can offer the action without elevating to admin.
 *
 * Guards:
 *   - caller is authenticated
 *   - device.memberId === caller.id (no touching anyone else's probe)
 *   - device.model === bottle_probe (locker sensors aren't paired)
 *   - wine.memberId === caller.id when wineId is set (no pairing a
 *     probe with a wine you don't own; also implicitly guards against
 *     wines from other facilities)
 */
export async function pairBottleProbeAction(input: {
  deviceId: string;
  wineId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await getServerAuth();
    if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
    const memberId = session.user.id;

    const parsed = PairBottleProbeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid input" };
    const { deviceId, wineId } = parsed.data;

    const device = await prisma.sentinelDevice.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        model: true,
        memberId: true,
        wineId: true,
        retiredAt: true,
      },
    });
    if (!device || device.memberId !== memberId) {
      return { ok: false, error: "Device not found" };
    }
    if (device.model !== SentinelModel.bottle_probe) {
      return { ok: false, error: "Only Bottle Probes can be paired" };
    }
    if (device.retiredAt) {
      return { ok: false, error: "This device has been retired" };
    }

    if (wineId) {
      const wine = await prisma.wine.findUnique({
        where: { id: wineId },
        select: { id: true, memberId: true },
      });
      if (!wine || wine.memberId !== memberId) {
        return { ok: false, error: "Wine not found" };
      }
    }

    await prisma.$transaction([
      prisma.sentinelDevice.update({
        where: { id: deviceId },
        data: { wineId },
      }),
      prisma.sentinelDeviceEvent.create({
        data: {
          deviceId,
          type: SentinelEventType.reassigned,
          actorMemberId: memberId,
          payload: {
            via: "settings",
            from: { wineId: device.wineId },
            to: { wineId },
          },
        },
      }),
    ]);

    revalidatePath("/settings");
    revalidatePath("/admin/sentinels");
    revalidatePath(`/admin/sentinels/${deviceId}`);
    return { ok: true };
  } catch (e) {
    logger.error("pairBottleProbeAction failed", e, {
      action: "pairBottleProbeAction",
    });
    return { ok: false, error: "Could not save. Try again in a moment." };
  }
}
