"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID_SEVERITIES = ["info", "warning", "critical"] as const;
type ValidSeverity = (typeof VALID_SEVERITIES)[number];

export async function updateAlertPreferences(formData: FormData): Promise<void> {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const enabledRaw = formData.get("emailAlertsEnabled");
  const severityRaw = formData.get("emailAlertSeverity");
  const cooldownRaw = formData.get("emailAlertCooldownMin");

  // Checkbox: form submits "on" when checked, nothing when unchecked.
  const emailAlertsEnabled = enabledRaw === "on" || enabledRaw === "true";

  const severity = typeof severityRaw === "string" && VALID_SEVERITIES.includes(severityRaw as ValidSeverity)
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
}
