import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  MapPin,
  BadgeCheck,
  Users,
  Lock,
  Grid3x3,
  Bell,
  DollarSign,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getFacilityAnalyticsKpis } from "@/lib/facility-analytics";
import { UuidSchema } from "@/lib/schemas";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import OccupancyDonut from "../occupancy-donut";
import { setPrivateLocationCertification, setLocationInstaller } from "./actions";

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

  const [kpis, facility, installers] = await Promise.all([
    getFacilityAnalyticsKpis(idCheck.data),
    prisma.facility.findUnique({
      where: { id: idCheck.data },
      include: {
        locationInstaller: true,
        ownerMember: { select: { name: true, email: true } },
      },
    }),
    prisma.locationInstaller.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, company: true, region: true },
    }),
  ]);
  if (!kpis) notFound();
  if (!facility) notFound();

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

      {facility.type === "private_location" && (
        <div className="glass-card p-5 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gold" />
              <h2 className="font-serif text-lg text-primary">
                Private location monitoring
              </h2>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
                facility.privateLocationCertifiedAt
                  ? "bg-gold/10 text-gold border-gold/30"
                  : "bg-warn/10 text-warn border-warn/30"
              }`}
            >
              <BadgeCheck className="w-3.5 h-3.5" />
              {facility.privateLocationCertifiedAt ? "Certified" : "Pending"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F10]/60 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Owner
              </p>
              {facility.ownerMember ? (
                <>
                  <p className="text-sm text-primary font-medium mt-1">
                    {facility.ownerMember.name}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {facility.ownerMember.email}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted mt-1 italic">Unassigned</p>
              )}
            </div>

            <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F10]/60 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Installation partner
              </p>
              {facility.locationInstaller ? (
                <>
                  <p className="text-sm text-primary font-medium mt-1">
                    {facility.locationInstaller.name}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {facility.locationInstaller.company
                      ? facility.locationInstaller.company
                      : "Caveau partner"}
                    {facility.locationInstaller.region
                      ? ` · ${facility.locationInstaller.region}`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted mt-1 italic">Unassigned</p>
              )}
            </div>

            <form
              action={setLocationInstaller}
              className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F10]/60 p-4"
            >
              <input type="hidden" name="facilityId" value={facility.id} />
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Assign installer
              </p>
              <select
                name="installerId"
                defaultValue={facility.locationInstallerId ?? ""}
                className="mt-2 w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:border-gold/60"
              >
                <option value="">Unassigned</option>
                {installers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.company ? ` · ${i.company}` : ""}
                    {i.region ? ` (${i.region})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="mt-3 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-gold text-black text-sm font-medium hover:bg-gold/90 transition-colors w-full"
              >
                Save installer
              </button>
            </form>

            <form
              action={setPrivateLocationCertification}
              className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F10]/60 p-4"
            >
              <input type="hidden" name="facilityId" value={facility.id} />
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Certification
              </p>
              <p className="text-sm text-secondary mt-1">
                {facility.privateLocationCertifiedAt
                  ? `Certified at ${facility.privateLocationCertifiedAt.toLocaleDateString(
                      "en-US",
                      { dateStyle: "medium" },
                    )}`
                  : "Mark certified after install + calibration."}
              </p>
              <input
                type="hidden"
                name="certified"
                value={facility.privateLocationCertifiedAt ? "0" : "1"}
              />
              <button
                type="submit"
                className={`mt-3 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-medium transition-colors w-full ${
                  facility.privateLocationCertifiedAt
                    ? "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15"
                    : "bg-gold text-black hover:bg-gold/90"
                }`}
              >
                {facility.privateLocationCertifiedAt
                  ? "Revoke certification"
                  : "Mark certified"}
              </button>
              <p className="text-[11px] text-muted mt-2">
                Installer roster lives at{" "}
                <Link
                  href="/admin/installers"
                  className="text-gold hover:text-gold-text"
                >
                  /admin/installers
                </Link>
                .
              </p>
            </form>
          </div>
        </div>
      )}

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
