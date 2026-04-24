import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Users,
  Lock,
  Grid3x3,
  Bell,
  DollarSign,
} from "lucide-react";
import { getFacilityAnalyticsKpis } from "@/lib/facility-analytics";
import { UuidSchema } from "@/lib/schemas";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import OccupancyDonut from "../occupancy-donut";

export const dynamic = "force-dynamic";

function percent(occupied: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((occupied / total) * 100);
}

export default async function AdminFacilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idCheck = UuidSchema.safeParse(id);
  if (!idCheck.success) notFound();

  const kpis = await getFacilityAnalyticsKpis(idCheck.data);
  if (!kpis) notFound();

  const slotPct = percent(kpis.slots.occupied, kpis.slots.total);

  const metrics = [
    {
      label: "Members",
      value: kpis.membersCount.toLocaleString(),
      sub: "enrolled",
      icon: Users,
    },
    {
      label: "Lockers",
      value: `${kpis.lockers.assigned}/${kpis.lockers.total}`,
      sub: "assigned",
      icon: Lock,
    },
    {
      label: "Slots",
      value: `${kpis.slots.occupied}/${kpis.slots.total}`,
      sub: `${slotPct}% used`,
      icon: Grid3x3,
    },
    {
      label: "Open alerts",
      value: kpis.alerts.open.toLocaleString(),
      sub:
        kpis.alerts.criticalOpen > 0
          ? `${kpis.alerts.criticalOpen} critical`
          : "none critical",
      icon: Bell,
      warn: kpis.alerts.criticalOpen > 0,
    },
    {
      label: "Custody value",
      value: formatCurrencyCompact(kpis.valueUnderCustodyUsd),
      sub: `${formatCurrency(kpis.valueUnderCustodyUsd)} under custody`,
      icon: DollarSign,
    },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Link
        href="/admin/facilities"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All facilities
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">
              {kpis.facility.name}
            </h1>
            <p className="text-sm text-muted">{kpis.facility.location}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.label} className="glass-card p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <m.icon
                className={`w-4 h-4 ${m.warn ? "text-danger" : "text-gold"}`}
              />
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {m.label}
            </p>
            <p className="font-serif text-2xl md:text-3xl text-primary mt-0.5 tabular-nums">
              {m.value}
            </p>
            {m.sub && (
              <p className="text-[11px] text-secondary mt-1">{m.sub}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OccupancyDonut occupied={kpis.slots.occupied} total={kpis.slots.total} />
        <div className="glass-card p-5">
          <h2 className="font-serif text-lg text-primary">Notes</h2>
          <p className="text-sm text-muted mt-2">
            Facility analytics is a demo operator view. KPIs are computed from
            facility enrollments, assigned lockers, stored slot occupancy, and
            Sentinel device alerts.
          </p>
        </div>
      </div>
    </div>
  );
}
