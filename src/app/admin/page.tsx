import Link from "next/link";
import {
  Users,
  Lock,
  Bell,
  Wine,
  Building2,
  ChevronRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrencyCompact, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [
    memberCount,
    lockerCount,
    occupiedLockers,
    activeWineCount,
    totalValueAgg,
    unresolvedAlertCount,
    criticalAlertCount,
    recentAlerts,
    facilities,
  ] = await Promise.all([
    prisma.member.count(),
    prisma.locker.count(),
    prisma.locker.count({ where: { memberId: { not: null } } }),
    prisma.wine.count({ where: { status: "in_cellar" } }),
    prisma.wine.aggregate({
      where: { status: "in_cellar" },
      _sum: { currentValue: true },
    }),
    prisma.alert.count({ where: { resolved: false } }),
    prisma.alert.count({
      where: { resolved: false, severity: "critical" },
    }),
    prisma.alert.findMany({
      where: { resolved: false },
      orderBy: { timestamp: "desc" },
      take: 5,
      include: {
        locker: { select: { lockerNumber: true, zone: true } },
      },
    }),
    prisma.facility.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { lockers: true, members: true } },
      },
    }),
  ]);

  const totalValue = totalValueAgg._sum.currentValue ?? 0;

  const metrics = [
    {
      label: "Members",
      value: memberCount.toLocaleString(),
      icon: Users,
      href: "/admin/members",
    },
    {
      label: "Lockers",
      value: `${occupiedLockers}/${lockerCount}`,
      sub: "assigned",
      icon: Lock,
      href: "/admin/lockers",
    },
    {
      label: "Active wines",
      value: activeWineCount.toLocaleString(),
      sub: formatCurrencyCompact(totalValue) + " under custody",
      icon: Wine,
      href: null,
    },
    {
      label: "Open alerts",
      value: unresolvedAlertCount.toLocaleString(),
      sub: criticalAlertCount > 0 ? `${criticalAlertCount} critical` : "none critical",
      icon: Bell,
      href: "/admin/alerts",
      warn: criticalAlertCount > 0,
    },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-serif text-2xl md:text-3xl text-primary">
          Admin Overview
        </h1>
        <p className="text-sm text-muted mt-1">
          Operator snapshot across members, lockers, and alerts.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {metrics.map((m) => {
          const Card = (
            <div
              className={`glass-card p-4 md:p-5 h-full ${
                m.href ? "hover:border-gold/40 transition-colors" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <m.icon
                  className={`w-4 h-4 ${m.warn ? "text-danger" : "text-gold"}`}
                />
                {m.href && (
                  <ChevronRight className="w-4 h-4 text-muted" />
                )}
              </div>
              <p className="text-[10px] uppercase tracking-wider text-muted">
                {m.label}
              </p>
              <p className="font-serif text-2xl md:text-3xl text-primary mt-0.5">
                {m.value}
              </p>
              {m.sub && (
                <p className="text-[11px] text-secondary mt-1">{m.sub}</p>
              )}
            </div>
          );
          return m.href ? (
            <Link key={m.label} href={m.href} className="block">
              {Card}
            </Link>
          ) : (
            <div key={m.label}>{Card}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent open alerts */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-primary">Open alerts</h2>
            <Link
              href="/admin/alerts"
              className="text-xs text-gold hover:text-gold-text flex items-center gap-1"
            >
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {recentAlerts.length === 0 ? (
            <p className="text-sm text-muted">
              No open alerts — all clear across facilities.
            </p>
          ) : (
            <ul className="divide-y divide-[#2A2A30]/50">
              {recentAlerts.map((a) => (
                <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        a.severity === "critical"
                          ? "badge-danger shrink-0"
                          : a.severity === "warning"
                            ? "badge-warn shrink-0"
                            : "badge-info shrink-0"
                      }
                    >
                      {a.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-primary truncate">
                        {a.message}
                      </p>
                      <p className="text-xs text-muted">
                        Locker #{a.locker.lockerNumber} ·{" "}
                        {formatRelativeTime(a.timestamp)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Facilities */}
        <div className="glass-card p-5">
          <h2 className="font-serif text-lg text-primary mb-4">Facilities</h2>
          <ul className="divide-y divide-[#2A2A30]/50">
            {facilities.map((f) => (
              <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-gold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-primary font-medium">
                      {f.name}
                    </p>
                    <p className="text-xs text-muted">
                      {f.location} · {f._count.lockers} lockers ·{" "}
                      {f._count.members} members
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
