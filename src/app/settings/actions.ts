"use server";

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
