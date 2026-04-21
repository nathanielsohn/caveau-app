import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Check, Crown, Mail, ShieldCheck, Sparkles, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  FOUNDING_BENEFITS,
  effectivePriceForMember,
  foundingSavingsUsd,
  tierSpecForDbTier,
} from "@/lib/tiers";
import SentinelDevicesCard from "@/components/sentinel-devices-card";
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
      tier: true,
      emailAlertsEnabled: true,
      emailAlertSeverity: true,
      emailAlertCooldownMin: true,
      emailBounced: true,
      emailComplained: true,
      hurricaneProtectionActive: true,
      foundingMember: true,
      foundingLockedAt: true,
    },
  });
  if (!member) redirect("/auth/login");

  const sesConfigured = Boolean(env.AWS_SES_FROM_EMAIL);
  const tierSpec = tierSpecForDbTier(member.tier);
  const effectivePrice = effectivePriceForMember(tierSpec, member.foundingMember);
  const foundingSavings = member.foundingMember
    ? foundingSavingsUsd(tierSpec)
    : 0;

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

      {/* Membership tier card (#44) — read-only summary, no billing. */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-gold" />
            <h2 className="font-serif text-lg text-primary">Membership</h2>
          </div>
          <div className="text-right shrink-0">
            <div className="font-serif text-xl text-primary">{tierSpec.name}</div>
            <div className="text-sm text-gold">{effectivePrice.priceDisplay}</div>
            {member.foundingMember && foundingSavings > 0 && (
              <div className="text-[11px] text-muted mt-0.5">
                <span className="line-through">{tierSpec.priceDisplay}</span>{" "}
                · founding rate
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-secondary mb-4">{tierSpec.description}</p>
        <div className="text-xs uppercase tracking-wider text-muted mb-3">
          Included services
        </div>
        <ul className="space-y-2">
          {tierSpec.includedServices.map((s) => (
            <li key={s} className="flex items-start gap-2 text-sm text-secondary">
              <Check className="w-3.5 h-3.5 text-gold shrink-0 mt-1" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Founding Member bundle (#54). Rendered only for members whose
          foundingMember flag was set at onboarding. Copy lists the promise;
          the welcome appraisal (#61) and allocation access (#60) are still
          on the roadmap, so this surface is the pre-launch commitment — the
          fulfillment UIs ship with those features. */}
      {member.foundingMember && (
        <div className="glass-card p-6 md:p-8 mb-6 border border-gold/30">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold" />
              <h2 className="font-serif text-lg text-primary">
                Founding Member
              </h2>
            </div>
            {member.foundingLockedAt && (
              <div className="text-[11px] uppercase tracking-wider text-muted shrink-0 mt-1">
                Locked{" "}
                {member.foundingLockedAt.toLocaleDateString("en-US", {
                  dateStyle: "medium",
                })}
              </div>
            )}
          </div>
          {foundingSavings > 0 ? (
            <p className="text-sm text-secondary mb-4">
              Your rate of {effectivePrice.priceDisplay} is locked for life
              with continuous membership — saving ${foundingSavings}/mo vs.
              the {tierSpec.priceDisplay} list price.
            </p>
          ) : (
            <p className="text-sm text-secondary mb-4">
              Your Founding Circle status is locked for life with continuous
              membership.
            </p>
          )}
          <div className="text-xs uppercase tracking-wider text-muted mb-3">
            Founding benefits
          </div>
          <ul className="space-y-2">
            {FOUNDING_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-secondary">
                <Check className="w-3.5 h-3.5 text-gold shrink-0 mt-1" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sentinel devices card (#59) */}
      <SentinelDevicesCard memberId={session.user.id} />

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

        {/* Bounce / complaint banner (#19 follow-up). Surfaced so a member
            isn't silently locked out of alerts after AWS marks their address
            undeliverable or they hit "report spam" — the webhook flips
            emailAlertsEnabled off, this tells them why. */}
        {member.emailBounced && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-danger/30 bg-danger/10 text-xs text-danger">
            Email alerts were paused because messages to{" "}
            <span className="font-medium">{member.email}</span> hard-bounced
            on{" "}
            {member.emailBounced.toLocaleDateString("en-US", {
              dateStyle: "medium",
            })}
            . Update the address with support before re-enabling.
          </div>
        )}
        {member.emailComplained && !member.emailBounced && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-warn/30 bg-warn/10 text-xs text-warn">
            Email alerts were paused after a spam complaint was received from{" "}
            <span className="font-medium">{member.email}</span> on{" "}
            {member.emailComplained.toLocaleDateString("en-US", {
              dateStyle: "medium",
            })}
            . Contact support to re-enable.
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

      {/* Hurricane Protection card (#46) */}
      <Link
        href="/settings/hurricane"
        className="glass-card p-6 md:p-8 mt-6 block hover:bg-[#1C1C20]/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-lg text-primary">
                Hurricane Emergency Collection Protection
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {member.hurricaneProtectionActive
                  ? "Enrolled — pre-landfall rescue active"
                  : "Not enrolled — opt in for storm-season coverage"}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted shrink-0" />
        </div>
      </Link>
    </div>
  );
}
