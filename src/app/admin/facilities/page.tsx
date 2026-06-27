import Link from "next/link";
import {
  Building2,
  BadgeCheck,
  Users,
  Lock,
  Grid3x3,
  Bell,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { listFacilityAnalyticsKpis } from "@/lib/facility-analytics";
import { formatCurrencyCompact } from "@/lib/utils";

export const dynamic = "force-dynamic";

function percent(occupied: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((occupied / total) * 100);
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-[#0F0F10]/60 px-3 py-2 ${
        warn ? "border-danger/40" : "border-[#2A2A30]/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${warn ? "text-danger" : "text-gold"}`} />
        <p className="text-[10px] uppercase tracking-wider text-muted">
          {label}
        </p>
      </div>
      <p className="font-serif text-lg text-primary tabular-nums mt-1">
        {value}
      </p>
      {sub && <p className="text-[11px] text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

export default async function AdminFacilitiesPage() {
  const facilities = await listFacilityAnalyticsKpis();

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Facilities</h1>
            <p className="text-sm text-muted">
              Location-level analytics across members, lockers, and Sentinel
              alerts.
            </p>
          </div>
        </div>
        <Link
          href="/admin/installers"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-[#2A2A30] text-sm text-secondary hover:text-primary hover:bg-[#1C1C20]/60 transition-colors"
        >
          <BadgeCheck className="w-4 h-4" />
          Installers
        </Link>
      </div>

      {facilities.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No facilities yet. Seed a facility to view location analytics.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {facilities.map((row) => {
            const slotPct = percent(row.slots.occupied, row.slots.total);
            const alertSub =
              row.alerts.criticalOpen > 0
                ? `${row.alerts.criticalOpen} critical`
                : "none critical";
            return (
              <Link
                key={row.facility.id}
                href={`/admin/facilities/${row.facility.id}`}
                className="block"
              >
                <div className="glass-card p-5 hover:border-gold/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-serif text-lg text-primary truncate">
                          {row.facility.name}
                        </p>
                        {row.facility.type === "private_location" && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                              row.facility.privateLocationCertifiedAt
                                ? "bg-gold/10 text-gold border-gold/30"
                                : "bg-warn/10 text-warn border-warn/30"
                            }`}
                          >
                            Private location
                            {row.facility.privateLocationCertifiedAt
                              ? " · Certified"
                              : " · Pending"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted truncate">
                        {row.facility.location}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted mt-1 shrink-0" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
                    <KpiTile
                      icon={Users}
                      label="Members"
                      value={row.membersCount.toLocaleString()}
                      sub="enrolled"
                    />
                    <KpiTile
                      icon={Lock}
                      label="Lockers"
                      value={`${row.lockers.assigned}/${row.lockers.total}`}
                      sub="assigned"
                    />
                    <KpiTile
                      icon={Grid3x3}
                      label="Slots"
                      value={`${row.slots.occupied}/${row.slots.total}`}
                      sub={`${slotPct}% used`}
                    />
                    <KpiTile
                      icon={Bell}
                      label="Open alerts"
                      value={row.alerts.open.toLocaleString()}
                      sub={alertSub}
                      warn={row.alerts.criticalOpen > 0}
                    />
                    <KpiTile
                      icon={DollarSign}
                      label="Custody value"
                      value={formatCurrencyCompact(row.valueUnderCustodyUsd)}
                      sub="in-cellar"
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
