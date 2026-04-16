import Link from "next/link";
import { redirect } from "next/navigation";
import { CloudLightning, Plus, ShieldCheck, ChevronRight } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { STAGE_LABELS, isActiveStage } from "@/lib/hurricane";

export const dynamic = "force-dynamic";

export default async function AdminHurricanePage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin && session.user.role !== Role.staff) {
    redirect("/");
  }

  const [protocols, enrolledCount] = await Promise.all([
    prisma.hurricaneProtocol.findMany({
      orderBy: { watchIssuedAt: "desc" },
      take: 50,
      include: {
        facility: { select: { name: true } },
        _count: { select: { members: true } },
      },
    }),
    prisma.member.count({ where: { hurricaneProtectionActive: true } }),
  ]);

  const active = protocols.filter((p) => isActiveStage(p.stage));
  const history = protocols.filter((p) => !isActiveStage(p.stage));

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">
              Hurricane Protection
            </h1>
            <p className="text-sm text-muted">
              {protocols.length}{" "}
              {protocols.length === 1 ? "protocol" : "protocols"} on record ·{" "}
              {enrolledCount} enrolled{" "}
              {enrolledCount === 1 ? "member" : "members"}
            </p>
          </div>
        </div>

        <Link
          href="/admin/hurricane/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Activate protocol
        </Link>
      </div>

      {/* Active protocols */}
      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted mb-3">
            Active
          </h2>
          <div className="glass-card divide-y divide-[#2A2A30]/50">
            {active.map((p) => (
              <Link
                key={p.id}
                href={`/admin/hurricane/${p.id}`}
                className="flex items-start gap-4 p-5 hover:bg-[#1C1C20]/60 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div className="w-10 h-10 rounded-lg bg-danger/10 flex items-center justify-center shrink-0">
                  <CloudLightning className="w-5 h-5 text-danger" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary font-medium">
                    Hurricane {p.stormName}
                    {p.category ? ` · Cat ${p.category}` : ""}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {p.facility.name} · Activated{" "}
                    {formatRelativeTime(p.watchIssuedAt)} ·{" "}
                    {p._count.members}{" "}
                    {p._count.members === 1 ? "member" : "members"}
                  </p>
                  <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-warn/10 text-warn border border-warn/30">
                    {STAGE_LABELS[p.stage]}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-3" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted mb-3">
          History
        </h2>
        {history.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-sm text-muted">No past protocols yet.</p>
          </div>
        ) : (
          <div className="glass-card divide-y divide-[#2A2A30]/50">
            {history.map((p) => (
              <Link
                key={p.id}
                href={`/admin/hurricane/${p.id}`}
                className="flex items-start gap-4 p-5 hover:bg-[#1C1C20]/60 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div className="w-10 h-10 rounded-lg bg-[#1C1C20]/80 flex items-center justify-center shrink-0">
                  <CloudLightning className="w-5 h-5 text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary font-medium">
                    Hurricane {p.stormName}
                    {p.category ? ` · Cat ${p.category}` : ""}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {p.facility.name} · {formatDate(p.watchIssuedAt)} ·{" "}
                    {p._count.members}{" "}
                    {p._count.members === 1 ? "member" : "members"}
                  </p>
                  <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1C1C20]/80 text-secondary border border-[#2A2A30]">
                    {STAGE_LABELS[p.stage]}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-3" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
