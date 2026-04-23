/**
 * Alert notification pipeline (feature #19).
 *
 * Entry point: `notifyAlert(alertId)`. Loads the alert + locker + owning
 * member, runs preference and cooldown gating, then sends an email via
 * `sendAlertEmail` and stamps `alerts.notified_at` on success.
 *
 * Gating order (cheap → expensive):
 *   1. Member opted in (`emailAlertsEnabled`)
 *   2. Severity meets the member's minimum (`emailAlertSeverity`)
 *   3. No prior notification for the same (locker, type) within the
 *      configured cooldown window.
 *
 * A failed or skipped email is never fatal — callers can assume this
 * function never throws.
 */
import { prisma } from "./prisma";
import { sendAlertEmail } from "./email";
import { sendAlertPush } from "./push";

type Severity = "info" | "warning" | "critical";

const SEVERITY_LEVEL: Record<Severity, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

function parseSeverity(s: string): Severity {
  if (s === "info" || s === "warning" || s === "critical") return s;
  return "warning";
}

export async function notifyAlert(alertId: string): Promise<void> {
  try {
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        locker: {
          include: { member: true },
        },
      },
    });

    if (!alert) return;
    if (alert.notifiedAt) return; // Already notified — idempotent.

    const member = alert.locker.member;
    if (!member || !member.email) return;
    if (!member.emailAlertsEnabled) return;

    const alertSeverity = parseSeverity(alert.severity);
    const minSeverity = parseSeverity(member.emailAlertSeverity);
    if (SEVERITY_LEVEL[alertSeverity] < SEVERITY_LEVEL[minSeverity]) return;

    // Cooldown: skip if the same locker+type was notified within the window.
    const cooldownMin = Math.max(0, member.emailAlertCooldownMin);
    if (cooldownMin > 0) {
      const cutoff = new Date(Date.now() - cooldownMin * 60_000);
      const recent = await prisma.alert.findFirst({
        where: {
          lockerId: alert.lockerId,
          type: alert.type,
          notifiedAt: { gte: cutoff },
          NOT: { id: alert.id },
        },
        select: { id: true },
      });
      if (recent) return;
    }

    const delivered = await sendAlertEmail(
      { name: member.name, email: member.email },
      {
        severity: alertSeverity,
        type: alert.type,
        message: alert.message,
        timestamp: alert.timestamp,
        lockerNumber: alert.locker.lockerNumber,
        lockerZone: alert.locker.zone,
      },
    );

    const pushDelivered = await sendAlertPush({
      memberId: member.id,
      title: `Caveau Alert • ${alert.type.replace(/_/g, " ")}`,
      body: alert.message,
      data: {
        alertId: alert.id,
        lockerId: alert.lockerId,
        type: alert.type,
        severity: alertSeverity,
      },
    });

    if (delivered || pushDelivered) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: { notifiedAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[notifyAlert] failed:", err);
  }
}
