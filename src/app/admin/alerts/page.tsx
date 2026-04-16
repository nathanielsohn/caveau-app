import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/utils";
import ResolveButton from "./resolve-button";

export const dynamic = "force-dynamic";

type Filter = "open" | "resolved" | "all";

function severityClass(sev: string): string {
  if (sev === "critical") return "badge-danger";
  if (sev === "warning") return "badge-warn";
  return "badge-info";
}

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const filter: Filter =
    searchParams?.filter === "resolved"
      ? "resolved"
      : searchParams?.filter === "all"
        ? "all"
        : "open";

  const where =
    filter === "open"
      ? { resolved: false }
      : filter === "resolved"
        ? { resolved: true }
        : {};

  const [alerts, openCount, resolvedCount] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 100,
      include: {
        locker: {
          select: {
            lockerNumber: true,
            zone: true,
            facility: { select: { name: true } },
            member: { select: { name: true } },
          },
        },
      },
    }),
    prisma.alert.count({ where: { resolved: false } }),
    prisma.alert.count({ where: { resolved: true } }),
  ]);

  const tabs: { key: Filter; label: string; count: number | null }[] = [
    { key: "open", label: "Open", count: openCount },
    { key: "resolved", label: "Resolved", count: resolvedCount },
    { key: "all", label: "All", count: null },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Alerts</h1>
          <p className="text-sm text-muted">
            {openCount} open · {resolvedCount} resolved
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        className="flex items-center gap-1 mb-4 border-b border-[#2A2A30]/60"
      >
        {tabs.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.key}
              role="tab"
              aria-selected={active}
              href={t.key === "open" ? "/admin/alerts" : `/admin/alerts?filter=${t.key}`}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                active
                  ? "text-gold border-gold"
                  : "text-secondary border-transparent hover:text-primary"
              }`}
            >
              {t.label}
              {t.count !== null && (
                <span className="ml-1.5 text-xs text-muted">({t.count})</span>
              )}
            </Link>
          );
        })}
      </div>

      {alerts.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No alerts match this filter.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <ul className="divide-y divide-[#2A2A30]/40">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="px-4 py-3 flex items-start gap-3 hover:bg-[#1C1C20]/40"
              >
                <span className={severityClass(a.severity) + " shrink-0 mt-0.5"}>
                  {a.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-primary">{a.message}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {a.locker.facility.name} · Locker #
                    {a.locker.lockerNumber} · Zone {a.locker.zone}
                    {a.locker.member?.name
                      ? ` · ${a.locker.member.name}`
                      : ""}
                    {" · "}
                    {formatRelativeTime(a.timestamp)}
                  </p>
                </div>
                <div className="shrink-0">
                  {a.resolved ? (
                    <span className="text-xs text-ok inline-flex items-center gap-1">
                      Resolved
                    </span>
                  ) : (
                    <ResolveButton alertId={a.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
