import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CloudLightning,
  ShieldCheck,
  FileText,
  CheckCircle2,
  CircleDot,
  XCircle,
} from "lucide-react";
import { Role, type HurricaneStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
} from "@/lib/utils";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  isActiveStage,
  nextStage,
} from "@/lib/hurricane";
import { advanceStage, snapshotMember } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminHurricaneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin && session.user.role !== Role.staff) {
    redirect("/");
  }

  const { id } = await params;
  const protocol = await prisma.hurricaneProtocol.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true } },
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: {
              id: true,
              name: true,
              email: true,
              tier: true,
            },
          },
        },
      },
    },
  });
  if (!protocol) notFound();

  const next = nextStage(protocol.stage);
  const totalSnapshotValue = protocol.members.reduce(
    (sum, m) =>
      sum + (m.totalValueSnapshot ? Number(m.totalValueSnapshot) : 0),
    0,
  );
  const totalSnapshotBottles = protocol.members.reduce(
    (sum, m) => sum + (m.bottleCountSnapshot ?? 0),
    0,
  );

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/admin/hurricane"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to protocols
      </Link>

      {/* Header */}
      <div className="flex items-start gap-3 mb-6 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center">
          <CloudLightning className="w-5 h-5 text-danger" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-2xl text-primary">
            Hurricane {protocol.stormName}
            {protocol.category ? ` · Cat ${protocol.category}` : ""}
          </h1>
          <p className="text-sm text-muted">
            {protocol.facility.name} ·{" "}
            {protocol.nhcAdvisory
              ? `NHC ${protocol.nhcAdvisory} · `
              : ""}
            Activated {formatRelativeTime(protocol.watchIssuedAt)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
            protocol.stage === "cancelled"
              ? "text-muted bg-[#1C1C20]/80 border-[#2A2A30]"
              : isActiveStage(protocol.stage)
                ? "text-warn bg-warn/10 border-warn/30"
                : "text-ok bg-ok/10 border-ok/30"
          }`}
        >
          {STAGE_LABELS[protocol.stage]}
        </span>
      </div>

      {/* Stage progression */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h2 className="font-serif text-lg text-primary">Stage</h2>
          {protocol.stage !== "cancelled" && (
            <div className="flex gap-2">
              {next && (
                <form action={advanceStage}>
                  <input type="hidden" name="protocolId" value={protocol.id} />
                  <input type="hidden" name="stage" value={next} />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-gold text-caveau-black text-sm font-semibold hover:bg-gold/90 transition-colors"
                  >
                    Advance → {STAGE_LABELS[next]}
                  </button>
                </form>
              )}
              {isActiveStage(protocol.stage) && protocol.stage !== "sheltered" && protocol.stage !== "all_clear" && (
                <form action={advanceStage}>
                  <input type="hidden" name="protocolId" value={protocol.id} />
                  <input type="hidden" name="stage" value="cancelled" />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl border border-[#2A2A30] text-secondary text-sm hover:text-primary hover:bg-[#1C1C20]/60 transition-colors"
                  >
                    Cancel protocol
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <StageTimeline protocol={protocol} />

        {protocol.notes && (
          <p className="text-xs text-muted italic mt-6 pt-4 border-t border-[#2A2A30]/60">
            {protocol.notes}
          </p>
        )}

        {protocol.facilityEventId && (
          <Link
            href={`/facility/events/${protocol.facilityEventId}`}
            prefetch={false}
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-gold hover:underline"
          >
            <FileText className="w-3.5 h-3.5" />
            View auto-generated post-event report
          </Link>
        )}
      </div>

      {/* Roster summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Members
          </p>
          <p className="font-serif text-2xl text-primary">
            {protocol.members.length}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Bottles protected
          </p>
          <p className="font-serif text-2xl text-primary">
            {totalSnapshotBottles || "—"}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Value protected
          </p>
          <p className="font-serif text-2xl text-primary">
            {totalSnapshotValue > 0
              ? formatCurrency(totalSnapshotValue)
              : "—"}
          </p>
        </div>
      </div>

      {/* Member roster */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-gold" />
          <h2 className="font-serif text-lg text-primary">Member roster</h2>
        </div>
        <p className="text-xs text-muted mb-5">
          Every enrolled member at {protocol.facility.name} at activation
          time. Capture the bottle count and value snapshot at pickup.
        </p>

        {protocol.members.length === 0 ? (
          <p className="text-sm text-muted italic">
            No enrolled members at this facility when the protocol was
            activated.
          </p>
        ) : (
          <ul className="divide-y divide-[#2A2A30]/50">
            {protocol.members.map((m) => (
              <li key={m.id} className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div className="min-w-0">
                    <p className="text-sm text-primary font-medium">
                      {m.member.name}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {m.member.email} · {m.member.tier} tier
                    </p>
                  </div>
                  {m.bottleCountSnapshot != null && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-ok/10 text-ok border border-ok/30">
                      Snapshot captured
                    </span>
                  )}
                </div>

                <form
                  action={snapshotMember}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3"
                >
                  <input type="hidden" name="membershipId" value={m.id} />
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                      Bottles
                    </label>
                    <input
                      type="number"
                      name="bottleCount"
                      defaultValue={m.bottleCountSnapshot ?? ""}
                      min={0}
                      placeholder="0"
                      className="w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                      Value (USD)
                    </label>
                    <input
                      type="number"
                      name="totalValue"
                      step="0.01"
                      defaultValue={
                        m.totalValueSnapshot
                          ? Number(m.totalValueSnapshot).toFixed(2)
                          : ""
                      }
                      min={0}
                      placeholder="0.00"
                      className="w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#1C1C20]/80 border border-[#2A2A30] text-sm text-secondary hover:text-primary hover:bg-[#1C1C20] transition-colors"
                    >
                      Save snapshot
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StageTimeline({
  protocol,
}: {
  protocol: {
    stage: HurricaneStage;
    watchIssuedAt: Date;
    transportDispatchedAt: Date | null;
    shelteredAt: Date | null;
    allClearAt: Date | null;
    returnedAt: Date | null;
    cancelledAt: Date | null;
  };
}) {
  if (protocol.stage === "cancelled") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <XCircle className="w-4 h-4" />
        Cancelled{" "}
        {protocol.cancelledAt ? formatRelativeTime(protocol.cancelledAt) : ""}
      </div>
    );
  }

  const currentIdx = STAGE_ORDER.indexOf(protocol.stage);
  const timestamps: Record<HurricaneStage, Date | null | undefined> = {
    watch_issued: protocol.watchIssuedAt,
    transport_dispatched: protocol.transportDispatchedAt,
    sheltered: protocol.shelteredAt,
    all_clear: protocol.allClearAt,
    returned: protocol.returnedAt,
    cancelled: protocol.cancelledAt,
  };

  return (
    <ul className="space-y-3">
      {STAGE_ORDER.map((stage, idx) => {
        const done = idx < currentIdx;
        const current = idx === currentIdx;
        const ts = timestamps[stage];
        const Icon = done ? CheckCircle2 : current ? CircleDot : CircleDot;
        return (
          <li key={stage} className="flex items-center gap-3">
            <Icon
              className={`w-4 h-4 shrink-0 ${
                done
                  ? "text-ok"
                  : current
                    ? "text-gold"
                    : "text-[#3A3A42]"
              }`}
            />
            <div className="flex-1 flex items-center justify-between gap-3">
              <span
                className={`text-sm ${
                  done || current ? "text-primary" : "text-muted"
                }`}
              >
                {STAGE_LABELS[stage]}
              </span>
              {ts && (
                <span className="text-xs text-muted">{formatDate(ts)}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
