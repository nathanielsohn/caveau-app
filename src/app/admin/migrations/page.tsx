import Link from "next/link";
import { redirect } from "next/navigation";
import { FileInput } from "lucide-react";
import { Role, type MigrationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { value: "all" | MigrationStatus; label: string }[] = [
  { value: "submitted", label: "Pending" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "failed", label: "Needs attention" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const STATUS_STYLES: Record<MigrationStatus, string> = {
  submitted: "bg-gold/10 text-gold border-gold/30",
  fulfilled: "bg-ok/10 text-ok border-ok/30",
  failed: "bg-danger/10 text-danger border-danger/30",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

const STATUS_LABELS: Record<MigrationStatus, string> = {
  submitted: "Pending",
  fulfilled: "Fulfilled",
  failed: "Needs attention",
  cancelled: "Cancelled",
};

const SOURCE_LABELS = {
  cellartracker: "CellarTracker",
  vivino: "Vivino",
  other: "CSV",
} as const;

function resolveStatusFilter(
  raw: string | undefined,
): "all" | MigrationStatus {
  if (!raw) return "submitted";
  if (raw === "all") return "all";
  if (
    raw === "submitted" ||
    raw === "fulfilled" ||
    raw === "failed" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  return "submitted";
}

export default async function AdminMigrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const params = await searchParams;
  const filter = resolveStatusFilter(params.status);

  const where: Prisma.MigrationRequestWhereInput =
    filter === "all" ? {} : { status: filter };

  const [requests, counts] = await Promise.all([
    prisma.migrationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        member: { select: { name: true, email: true, tier: true } },
      },
      take: 500,
    }),
    prisma.migrationRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map<MigrationStatus, number>();
  for (const c of counts) byStatus.set(c.status, c._count._all);
  const totalAll = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <FileInput className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Migrations</h1>
            <p className="text-sm text-muted">
              Concierge CSV migrations from CellarTracker, Vivino, and custom
              exports.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? totalAll
              : (byStatus.get(f.value) ?? 0);
          const active = f.value === filter;
          return (
            <Link
              key={f.value}
              href={`/admin/migrations?status=${f.value}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                active
                  ? "bg-gold/10 border-gold/40 text-gold"
                  : "border-[#2A2A30] text-secondary hover:text-primary hover:border-[#2A2A30]/80"
              }`}
            >
              {f.label}
              <span
                className={`text-[10px] ${active ? "text-gold" : "text-muted"}`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {requests.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            Nothing to show for this filter yet.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-4 py-3 font-medium">Member</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-left px-4 py-3 font-medium">File</th>
                <th className="text-left px-4 py-3 font-medium">Rows</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Submitted</th>
                <th className="text-left px-4 py-3 font-medium">Fulfilled</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/migrations/${r.id}`}
                      className="text-primary hover:text-gold transition-colors"
                    >
                      {r.member.name}
                    </Link>
                    <p className="text-[11px] text-muted">{r.member.email}</p>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {SOURCE_LABELS[r.source]}
                  </td>
                  <td className="px-4 py-3 text-secondary max-w-xs truncate">
                    {r.originalFilename}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {r.status === "fulfilled" && r.fulfilledWineCount != null
                      ? `${r.fulfilledWineCount} / ${r.rowCount}`
                      : r.rowCount}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[r.status]}`}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {r.fulfilledAt ? formatDate(r.fulfilledAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
