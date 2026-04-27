import Link from "next/link";
import {
  BadgeCheck,
  Users,
  Building2,
  Mail,
  Phone,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import NewInstallerForm from "./new-installer-form";
import { toggleInstallerActive } from "./actions";

export const dynamic = "force-dynamic";

function pill(active: boolean): { label: string; className: string } {
  return active
    ? { label: "Active", className: "badge-ok" }
    : { label: "Inactive", className: "badge-info" };
}

export default async function AdminInstallersPage() {
  const installers = await prisma.homeCellarInstaller.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      facilities: {
        where: { type: "home_cellar" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          location: true,
          homeCellarCertifiedAt: true,
        },
      },
    },
  });

  const activeCount = installers.filter((i) => i.active).length;
  const assignedCellars = installers.reduce(
    (acc, i) => acc + i.facilities.length,
    0,
  );
  const certifiedCellars = installers.reduce(
    (acc, i) => acc + i.facilities.filter((f) => Boolean(f.homeCellarCertifiedAt)).length,
    0,
  );

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">
              Certified installers
            </h1>
            <p className="text-sm text-muted">
              {installers.length} installers · {activeCount} active ·{" "}
              {certifiedCellars}/{assignedCellars} certified home cellars
            </p>
          </div>
        </div>
        <Link
          href="/admin/facilities"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-[#2A2A30] text-sm text-secondary hover:text-primary hover:bg-[#1C1C20]/60 transition-colors"
        >
          <Building2 className="w-4 h-4" />
          Facilities
        </Link>
      </div>

      <div className="mb-6">
        <NewInstallerForm />
      </div>

      {installers.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No installers yet. Add one above to start tracking Home Cellar installs.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {installers.map((i) => {
            const status = pill(i.active);
            const certifiedCountForInstaller = i.facilities.filter((f) =>
              Boolean(f.homeCellarCertifiedAt),
            ).length;
            return (
              <div key={i.id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-serif text-lg text-primary truncate">
                        {i.name}
                      </p>
                      <span className={status.className}>{status.label}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted mt-1">
                      {i.company && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-gold" />
                          {i.company}
                        </span>
                      )}
                      {i.region && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gold" />
                          {i.region}
                        </span>
                      )}
                      {i.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-gold" />
                          {i.email}
                        </span>
                      )}
                      {i.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-gold" />
                          {i.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted uppercase tracking-widest">
                      Home cellars
                    </p>
                    <p className="font-serif text-xl text-primary tabular-nums mt-0.5">
                      {i.facilities.length}
                    </p>
                    <p className="text-[11px] text-secondary mt-0.5">
                      {certifiedCountForInstaller} certified
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {i.facilities.slice(0, 3).map((f) => (
                      <Link
                        key={f.id}
                        href={`/admin/facilities/${f.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#2A2A30] text-xs text-secondary hover:text-primary hover:bg-[#1C1C20]/60 transition-colors"
                      >
                        {f.name}
                        <ChevronRight className="w-3.5 h-3.5 text-muted" />
                      </Link>
                    ))}
                    {i.facilities.length > 3 && (
                      <span className="text-xs text-muted">
                        +{i.facilities.length - 3} more
                      </span>
                    )}
                    {i.facilities.length === 0 && (
                      <span className="text-xs text-muted italic">
                        No assignments yet
                      </span>
                    )}
                  </div>

                  <form action={toggleInstallerActive}>
                    <input type="hidden" name="installerId" value={i.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={i.active ? "0" : "1"}
                    />
                    <button
                      type="submit"
                      className={`min-h-[44px] px-4 rounded-xl text-sm font-medium transition-colors ${
                        i.active
                          ? "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15"
                          : "bg-gold text-black hover:bg-gold/90"
                      }`}
                    >
                      {i.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
