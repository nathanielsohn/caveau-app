"use server";

import { z } from "zod";
import { SentinelEventType, SentinelModel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

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
