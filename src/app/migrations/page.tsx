import Link from "next/link";
import { redirect } from "next/navigation";
import { FileInput, Plus, ArrowRight } from "lucide-react";
import type { MigrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

export default async function MigrationsPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const requests = await prisma.migrationRequest.findMany({
    where: { memberId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      source: true,
      originalFilename: true,
      status: true,
      rowCount: true,
      fulfilledWineCount: true,
      fulfilledAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <FileInput className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">
              Collection migrations
            </h1>
            <p className="text-sm text-muted">
              White-glove import from CellarTracker, Vivino, or any CSV. 48-hour
              turnaround by our concierge team.
            </p>
          </div>
        </div>

        <Link
          href="/migrations/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Start a migration
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted mb-4">
            No migrations yet. Upload a CellarTracker or Vivino export and our
            team will build your collection in Caveau within 48 hours.
          </p>
          <Link
            href="/migrations/new"
            className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
          >
            Start your first migration
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
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
                  <td className="px-4 py-3 text-primary">
                    <Link
                      href={`/migrations/${r.id}`}
                      className="hover:text-gold transition-colors"
                    >
                      {SOURCE_LABELS[r.source]}
                    </Link>
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
