import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  Check,
  CreditCard,
  Crown,
  FileText,
  Mail,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Shield,
} from "lucide-react";
import { AppraisalStatus, InsuranceReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  FOUNDING_BENEFITS,
  effectivePriceForMember,
  foundingSavingsUsd,
  tierSpecForDbTier,
} from "@/lib/tiers";
import { checkWelcomeEligibility } from "@/lib/appraisals";
import { getReservedSlotCountForMember } from "@/lib/billing";
import SentinelDevicesCard from "@/components/sentinel-devices-card";
import PreferencesForm from "./preferences-form";
import BillingButtons from "./billing-buttons";

export const dynamic = "force-dynamic";

function hasActiveStripeMembership(status: string | null | undefined): boolean {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "unpaid" ||
    status === "incomplete"
  );
}

function billingBadge(status: string | null | undefined): {
  label: string;
  className: string;
} {
  const s = status ?? "";
  if (!s) return { label: "Not started", className: "badge-info" };
  if (s === "active") return { label: "Active", className: "badge-ok" };
  if (s === "trialing") return { label: "Trial", className: "badge-ok" };
  if (s === "past_due") return { label: "Past due", className: "badge-warn" };
  if (s === "unpaid") return { label: "Unpaid", className: "badge-danger" };
  if (s === "canceled") return { label: "Canceled", className: "badge-danger" };
  if (s === "paused") return { label: "Paused", className: "badge-info" };
  if (s === "incomplete") return { label: "Incomplete", className: "badge-warn" };
  if (s === "incomplete_expired")
    return { label: "Expired", className: "badge-danger" };
  return { label: s.replace(/_/g, " "), className: "badge-info" };
}

function insuranceStatusLabel(status: InsuranceReferralStatus): string {
  if (status === "submitted") return "Submitted";
  if (status === "in_review") return "In review";
  if (status === "introduced") return "Introduced";
  if (status === "bound") return "Enrolled";
  if (status === "declined") return "Declined";
  if (status === "cancelled") return "Cancelled";
  return String(status).replace(/_/g, " ");
}

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
      stripeCustomerId: true,
      stripeSubscriptionStatus: true,
      stripeCurrentPeriodEnd: true,
    },
  });
  if (!member) redirect("/auth/login");

  const sesConfigured = Boolean(env.AWS_SES_FROM_EMAIL);
  const stripeConfigured = Boolean(env.STRIPE_SECRET_KEY);
  const insuranceConfigured =
    env.INSURANCE_PARTNER_ENABLED &&
    (Boolean(env.INSURANCE_API_SECRET) ||
      env.NODE_ENV === "development" ||
      env.NODE_ENV === "test");
  const tierSpec = tierSpecForDbTier(member.tier);
  const effectivePrice = effectivePriceForMember(tierSpec, member.foundingMember);
  const foundingSavings = member.foundingMember
    ? foundingSavingsUsd(tierSpec)
    : 0;
  const reservedSlots = await getReservedSlotCountForMember(session.user.id);
  const activeMembership = hasActiveStripeMembership(member.stripeSubscriptionStatus);
  const badge = billingBadge(member.stripeSubscriptionStatus);

  // Welcome-appraisal state (feature #61). Founding members see either
  // a "claim now" CTA or a "completed on" row inside the Founding Circle
  // bundle. Non-founding members skip this entirely.
  const welcome = member.foundingMember
    ? await checkWelcomeEligibility(session.user.id, member.foundingMember)
    : null;
  const welcomeCompleted =
    welcome?.existing?.status === AppraisalStatus.completed
      ? welcome.existing
      : null;
  const welcomePending =
    welcome?.existing && !welcomeCompleted ? welcome.existing : null;

  const latestInsuranceReferral = await prisma.insuranceReferral.findFirst({
    where: { memberId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { partnerName: true, status: true, createdAt: true },
  });
  const insuranceSummary = !insuranceConfigured
    ? "Disabled — not configured in this environment"
    : latestInsuranceReferral
      ? `${latestInsuranceReferral.partnerName} · ${insuranceStatusLabel(
          latestInsuranceReferral.status,
        )}`
      : "Apply Caveau certified storage discount with your carrier";

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Settings</h1>
          <p className="text-sm text-muted">
            Manage billing, alerts, and protection preferences
          </p>
        </div>
      </div>

      {/* Membership tier card (#44) — summary + billing (#27). */}
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

        {/* Billing status + CTAs (#27) */}
        <div className="mt-6 pt-6 border-t border-[#2A2A30]/50">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-gold" />
                <h3 className="font-serif text-base text-primary">Billing</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={badge.className}>{badge.label}</span>
                {member.stripeCurrentPeriodEnd && (
                  <span className="text-xs text-muted">
                    {member.stripeSubscriptionStatus === "canceled" ? "Ends" : "Renews"}{" "}
                    {member.stripeCurrentPeriodEnd.toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-2">
                Storage is billed per reserved locker slot — {reservedSlots}{" "}
                {reservedSlots === 1 ? "slot" : "slots"} reserved.
              </p>
            </div>

            <BillingButtons
              startDisabled={!stripeConfigured || activeMembership || reservedSlots <= 0}
              manageDisabled={!stripeConfigured || !member.stripeCustomerId}
            />
          </div>

          {!stripeConfigured && (
            <div className="mt-4 px-4 py-3 rounded-xl border border-warn/30 bg-warn/10 text-xs text-warn">
              Billing is not configured for this environment (Stripe is inactive).
              Membership checkout and billing management are disabled until an
              administrator configures Stripe.
            </div>
          )}

          {stripeConfigured && reservedSlots <= 0 && (
            <div className="mt-4 px-4 py-3 rounded-xl border border-warn/30 bg-warn/10 text-xs text-warn">
              No lockers are assigned to your account, so storage billing cannot
              be computed. Contact support to reserve a locker.
            </div>
          )}

          {activeMembership && (
            <div className="mt-4 text-xs text-muted">
              Need to update your card or cancel? Use <span className="text-primary">Manage billing</span>.
            </div>
          )}
        </div>
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

          {/* Welcome appraisal status line (#61) */}
          <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gold shrink-0" />
                <span className="text-sm text-primary">
                  Welcome appraisal
                </span>
              </div>
              {welcomeCompleted ? (
                <Link
                  href={`/appraisals/${welcomeCompleted.id}`}
                  className="text-xs text-ok hover:text-ok/80 transition-colors"
                >
                  Completed{" "}
                  {welcomeCompleted.completedAt?.toLocaleDateString("en-US", {
                    dateStyle: "medium",
                  }) ?? "recently"}{" "}
                  →
                </Link>
              ) : welcomePending ? (
                <Link
                  href={`/appraisals/${welcomePending.id}`}
                  className="text-xs text-gold-text hover:text-gold transition-colors"
                >
                  In progress — view request →
                </Link>
              ) : (
                <Link
                  href="/appraisals/new?welcome=1"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-medium hover:bg-gold/15 transition-colors"
                >
                  Claim now →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Appraisals card — links every tier to the appraisal list */}
      <Link
        href="/appraisals"
        className="glass-card p-6 md:p-8 mb-6 block hover:bg-[#1C1C20]/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-lg text-primary">Appraisals</h2>
              <p className="text-xs text-muted mt-0.5">
                Insurance, estate, and tax valuation documents for your
                collection
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted shrink-0" />
        </div>
      </Link>

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

      {/* Insurance partner program card (#31) */}
      <Link
        href="/settings/insurance"
        className="glass-card p-6 md:p-8 mt-6 block hover:bg-[#1C1C20]/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-lg text-primary">
                Insurance partner program
              </h2>
              <p className="text-xs text-muted mt-0.5 truncate">
                {insuranceSummary}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted shrink-0" />
        </div>
      </Link>

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
