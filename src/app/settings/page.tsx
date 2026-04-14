import { redirect } from "next/navigation";
import { Bell, Mail } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import PreferencesForm from "./preferences-form";

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
      <div className="glass-card p-6 md:p-8">
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

        <PreferencesForm
          defaults={{
            email: member.email,
            emailAlertsEnabled: member.emailAlertsEnabled,
            emailAlertSeverity: member.emailAlertSeverity,
            emailAlertCooldownMin: member.emailAlertCooldownMin,
          }}
        />
      </div>
    </div>
  );
}
