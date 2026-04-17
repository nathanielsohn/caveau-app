import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrencyCompact, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  // Pull the member roster and the in-cellar wine aggregates in parallel.
  // The aggregate replaces an earlier `wines: { select: { currentValue } }`
  // include that loaded every bottle into Node just to sum it — a 50-member
  // x 50-bottle roster transferred 2,500 rows for a number we can compute
  // in the database in one round-trip.
  const [members, walletAggregates] = await Promise.all([
    prisma.member.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tier: true,
        onboardedAt: true,
        createdAt: true,
        _count: {
          select: { lockers: true, facilities: true },
        },
      },
    }),
    prisma.wine.groupBy({
      by: ["memberId"],
      where: { status: "in_cellar" },
      _sum: { currentValue: true },
      _count: { _all: true },
    }),
  ]);

  const aggregateByMember = new Map(
    walletAggregates.map((a) => [
      a.memberId,
      {
        activeCount: a._count._all,
        totalValue: Number(a._sum.currentValue ?? 0),
      },
    ]),
  );

  const rows = members.map((m) => {
    const agg = aggregateByMember.get(m.id);
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      tier: m.tier,
      onboardedAt: m.onboardedAt,
      joinedAt: m.createdAt,
      lockerCount: m._count.lockers,
      facilityCount: m._count.facilities,
      activeCount: agg?.activeCount ?? 0,
      totalValue: agg?.totalValue ?? 0,
    };
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Members</h1>
          <p className="text-sm text-muted">
            {rows.length} total — roster across all facilities.
          </p>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-[#2A2A30]/60">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Tier</th>
              <th className="px-4 py-3 font-medium text-right">Lockers</th>
              <th className="px-4 py-3 font-medium text-right">Bottles</th>
              <th className="px-4 py-3 font-medium text-right">Value</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[#2A2A30]/40 last:border-b-0 hover:bg-[#1C1C20]/40"
              >
                <td className="px-4 py-3">
                  <p className="text-primary font-medium">{r.name}</p>
                  <p className="text-xs text-muted">{r.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      r.role === "admin"
                        ? "badge-warn"
                        : r.role === "staff"
                          ? "badge-info"
                          : "badge-ok"
                    }
                  >
                    {r.role}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize text-secondary">
                  {r.tier}
                </td>
                <td className="px-4 py-3 text-right text-secondary">
                  {r.lockerCount}
                </td>
                <td className="px-4 py-3 text-right text-secondary">
                  {r.activeCount}
                </td>
                <td className="px-4 py-3 text-right text-primary font-medium">
                  {r.activeCount > 0
                    ? formatCurrencyCompact(r.totalValue)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {formatDate(r.joinedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="glass-card p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-primary font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted truncate">{r.email}</p>
              </div>
              <span
                className={
                  r.role === "admin"
                    ? "badge-warn"
                    : r.role === "staff"
                      ? "badge-info"
                      : "badge-ok"
                }
              >
                {r.role}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted uppercase tracking-wider text-[10px]">
                  Tier
                </dt>
                <dd className="text-secondary capitalize">{r.tier}</dd>
              </div>
              <div>
                <dt className="text-muted uppercase tracking-wider text-[10px]">
                  Lockers
                </dt>
                <dd className="text-secondary">{r.lockerCount}</dd>
              </div>
              <div>
                <dt className="text-muted uppercase tracking-wider text-[10px]">
                  Bottles
                </dt>
                <dd className="text-secondary">{r.activeCount}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted mt-3">
              Joined {formatDate(r.joinedAt)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
