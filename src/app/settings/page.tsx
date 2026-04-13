import { redirect } from "next/navigation";
import { Bell, Mail } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { updateAlertPreferences } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      emailAlertsEnabled: true,
      emailAlertSeverity: true,
      emailAlertCooldownMin: true,
    },
  });
  if (!member) redirect("/auth/login");

  const sesConfigured = Boolean(env.AWS_SES_FROM_EMAIL);

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Settings</h1>
          <p className="text-sm text-muted">Manage your notification preferences</p>
        </div>
      </div>

      {/* Alert email preferences card */}
      <form action={updateAlertPreferences} className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-gold" />
          <h2 className="font-serif text-lg text-primary">Alert Email Notifications</h2>
        </div>
        <p className="text-xs text-muted mb-6">
          Receive real-time emails when Sentinel detects a threshold breach in any of your lockers.
        </p>

        {!sesConfigured && (
          <div className="mb-6 px-4 py-3 rounded-xl border border-warn/30 bg-warn/10 text-xs text-warn">
            Email delivery is not configured for this environment (AWS SES is inactive).
            Preferences will save but no emails will be sent until an administrator configures SES.
          </div>
        )}

        {/* Master toggle */}
        <label className="flex items-start justify-between gap-4 py-4 border-b border-[#2A2A30]/60 cursor-pointer">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-primary font-medium">Enable email alerts</p>
            <p className="text-xs text-muted mt-0.5 truncate">
              Send notifications to {member.email}
            </p>
          </div>
          <input
            type="checkbox"
            name="emailAlertsEnabled"
            defaultChecked={member.emailAlertsEnabled}
            className="mt-1 w-5 h-5 rounded border-[#2A2A30] bg-[#0F0F11] text-gold focus:ring-gold focus:ring-offset-0"
          />
        </label>

        {/* Severity threshold */}
        <div className="py-4 border-b border-[#2A2A30]/60">
          <label htmlFor="emailAlertSeverity" className="block text-sm text-primary font-medium mb-1">
            Minimum severity
          </label>
          <p className="text-xs text-muted mb-3">
            Only receive emails for alerts at this severity or higher.
          </p>
          <select
            id="emailAlertSeverity"
            name="emailAlertSeverity"
            defaultValue={member.emailAlertSeverity}
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary focus:border-gold/60 focus:outline-none"
          >
            <option value="info">Info — all alerts</option>
            <option value="warning">Warning — warnings and critical</option>
            <option value="critical">Critical only</option>
          </select>
        </div>

        {/* Cooldown */}
        <div className="py-4 border-b border-[#2A2A30]/60">
          <label htmlFor="emailAlertCooldownMin" className="block text-sm text-primary font-medium mb-1">
            Duplicate cooldown
          </label>
          <p className="text-xs text-muted mb-3">
            Wait at least this many minutes before re-sending a notification for the same locker and alert type. Set to 0 to disable.
          </p>
          <div className="flex items-center gap-3">
            <input
              id="emailAlertCooldownMin"
              name="emailAlertCooldownMin"
              type="number"
              min={0}
              max={1440}
              defaultValue={member.emailAlertCooldownMin}
              className="w-28 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary focus:border-gold/60 focus:outline-none"
            />
            <span className="text-xs text-muted">minutes</span>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-6">
          <button type="submit" className="btn-gold min-h-[44px]">
            Save preferences
          </button>
        </div>
      </form>
    </div>
  );
}
