import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  ArrowLeft,
  CloudLightning,
  Percent,
  Building2,
  History,
  ChevronRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate, formatRelativeTime, toNumber } from "@/lib/utils";
import { MEMBER_STAGE_LABELS, isActiveStage } from "@/lib/hurricane";
import EnrollmentForm from "./enrollment-form";

export const dynamic = "force-dynamic";

export default async function HurricaneSettingsPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: {
      hurricaneProtectionActive: true,
      hurricaneProtectionEnrolledAt: true,
      hurricaneInsurancePartner: true,
      hurricaneInsuranceDiscountPct: true,
    },
  });
  if (!member) redirect("/auth/login");

  const participations = await prisma.hurricaneProtocolMember.findMany({
    where: { memberId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      protocol: {
        select: {
          id: true,
          stormName: true,
          category: true,
          stage: true,
          watchIssuedAt: true,
          returnedAt: true,
          facilityEventId: true,
          facility: { select: { name: true } },
        },
      },
    },
  });

  const activeParticipation = participations.find((p) =>
    isActiveStage(p.protocol.stage),
  );
  const discount = member.hurricaneInsuranceDiscountPct
    ? toNumber(member.hurricaneInsuranceDiscountPct)
    : null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to settings
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">
            Hurricane Emergency Collection Protection
          </h1>
          <p className="text-sm text-muted">
            Pre-landfall rescue protocol for Southwest Florida members
          </p>
        </div>
      </div>

      {/* Active protocol banner */}
      {activeParticipation && (
        <div className="glass-card border border-danger/40 bg-danger/10 p-5 mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <CloudLightning className="w-4 h-4 text-danger" />
            <p className="text-sm font-medium text-primary">
              Hurricane {activeParticipation.protocol.stormName}
              {activeParticipation.protocol.category
                ? ` · Cat ${activeParticipation.protocol.category}`
                : ""}
            </p>
          </div>
          <p className="text-sm text-secondary">
            {MEMBER_STAGE_LABELS[activeParticipation.protocol.stage]}
            {activeParticipation.bottleCountSnapshot
              ? ` · ${activeParticipation.bottleCountSnapshot} bottle${activeParticipation.bottleCountSnapshot === 1 ? "" : "s"} accounted for`
              : ""}
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <h2 className="font-serif text-lg text-primary mb-3">How it works</h2>
        <ol className="space-y-3 text-sm text-secondary">
          <li className="flex gap-3">
            <span className="text-gold font-semibold shrink-0">1.</span>
            <span>
              <span className="text-primary">NHC issues a watch</span> for your
              region — we arm the protocol and notify you by phone and email.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold font-semibold shrink-0">2.</span>
            <span>
              <span className="text-primary">Refrigerated transport is dispatched</span>{" "}
              to pick up your collection. Staff photographs and inventories
              every bottle against your live portfolio before loading.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold font-semibold shrink-0">3.</span>
            <span>
              <span className="text-primary">Collection shelters inland</span>{" "}
              at our airport vault partner, climate-controlled, until the NHC
              issues an all-clear.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold font-semibold shrink-0">4.</span>
            <span>
              <span className="text-primary">Return delivery</span> once your
              home is confirmed safe. A post-event environmental report
              documents the unbroken cold-chain.
            </span>
          </li>
        </ol>
      </div>

      {/* Enrollment */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-gold" />
          <h2 className="font-serif text-lg text-primary">Your enrollment</h2>
        </div>
        <p className="text-xs text-muted mb-2">
          {member.hurricaneProtectionEnrolledAt
            ? `Enrolled ${formatDate(member.hurricaneProtectionEnrolledAt)} · ${formatRelativeTime(member.hurricaneProtectionEnrolledAt)}`
            : "Hurricane protection is an opt-in service."}
        </p>
        <EnrollmentForm initialEnrolled={member.hurricaneProtectionActive} />
      </div>

      {/* Insurance partner */}
      {member.hurricaneInsurancePartner && (
        <div className="glass-card p-6 md:p-8 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-gold" />
            <h2 className="font-serif text-lg text-primary">Carrier partnership</h2>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-primary font-medium">
                {member.hurricaneInsurancePartner}
              </p>
              <p className="text-xs text-muted mt-0.5">
                Proof-of-storage shared with your carrier
              </p>
            </div>
            {discount != null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ok/10 border border-ok/30">
                <Percent className="w-3.5 h-3.5 text-ok" />
                <span className="text-sm text-ok font-medium">
                  {discount.toFixed(1)}% premium discount
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Participation history */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-gold" />
          <h2 className="font-serif text-lg text-primary">Protocol history</h2>
        </div>

        {participations.length === 0 ? (
          <p className="text-sm text-muted italic">
            No hurricane activations on record for your account yet.
          </p>
        ) : (
          <ul className="divide-y divide-[#2A2A30]/50">
            {participations.map((p) => {
              const href = p.protocol.facilityEventId
                ? `/facility/events/${p.protocol.facilityEventId}`
                : null;
              const body = (
                <div className="flex items-start gap-4 py-4">
                  <div className="w-9 h-9 rounded-lg bg-[#1C1C20]/80 flex items-center justify-center shrink-0">
                    <CloudLightning className="w-4 h-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary font-medium">
                      Hurricane {p.protocol.stormName}
                      {p.protocol.category ? ` · Cat ${p.protocol.category}` : ""}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {p.protocol.facility.name} ·{" "}
                      {formatDate(p.protocol.watchIssuedAt)}
                      {p.protocol.returnedAt
                        ? ` – ${formatDate(p.protocol.returnedAt)}`
                        : ""}
                    </p>
                    <p className="text-xs text-secondary mt-1">
                      {MEMBER_STAGE_LABELS[p.protocol.stage]}
                      {p.bottleCountSnapshot
                        ? ` · ${p.bottleCountSnapshot} bottle${p.bottleCountSnapshot === 1 ? "" : "s"} protected`
                        : ""}
                    </p>
                  </div>
                  {href && (
                    <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-2" />
                  )}
                </div>
              );
              return (
                <li key={p.id}>
                  {href ? (
                    <Link
                      href={href}
                      className="block -mx-2 px-2 rounded-xl hover:bg-[#1C1C20]/60 transition-colors"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
