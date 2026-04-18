import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { UuidSchema } from "@/lib/schemas";
import type { ColumnMapping } from "@/lib/migration-mapping";
import AdminMigrationActions from "./admin-migration-actions";

export const dynamic = "force-dynamic";

const SOURCE_LABELS = {
  cellartracker: "CellarTracker",
  vivino: "Vivino",
  other: "Custom CSV",
} as const;

export default async function AdminMigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const { id } = await params;
  const idCheck = UuidSchema.safeParse(id);
  if (!idCheck.success) notFound();

  const migration = await prisma.migrationRequest.findUnique({
    where: { id: idCheck.data },
    include: {
      member: { select: { id: true, name: true, email: true, tier: true } },
    },
  });
  if (!migration) notFound();

  const fulfilledBy = migration.fulfilledById
    ? await prisma.member.findUnique({
        where: { id: migration.fulfilledById },
        select: { name: true, email: true },
      })
    : null;

  const mapping = (migration.columnMapping as ColumnMapping) ?? {};
  const rows = (migration.rows as Record<string, string>[]) ?? [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const visibleRows = rows.slice(0, 50);

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <Link
        href="/admin/migrations"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All migrations
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-primary">
            {migration.member.name}
          </h1>
          <p className="text-sm text-muted mt-1">
            {migration.member.email} · {migration.member.tier} · submitted{" "}
            {formatDate(migration.createdAt)} · {SOURCE_LABELS[migration.source]}{" "}
            · {migration.rowCount}{" "}
            {migration.rowCount === 1 ? "row" : "rows"}
          </p>
          <p className="text-[11px] text-muted mt-1 font-mono">
            {migration.originalFilename}
          </p>
        </div>

        <Link
          href={`/admin/migrations/${migration.id}/export`}
          prefetch={false}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-secondary text-sm hover:text-primary hover:border-[#2A2A30]/80 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export payload
        </Link>
      </div>

      {migration.note && (
        <div className="glass-card p-5 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Note from member
          </p>
          <p className="text-sm text-secondary whitespace-pre-wrap">
            {migration.note}
          </p>
        </div>
      )}

      {migration.status === "fulfilled" && (
        <div className="glass-card p-5 mb-6 border border-ok/20">
          <p className="text-[10px] uppercase tracking-wider text-ok mb-1">
            Fulfilled
          </p>
          <p className="text-sm text-secondary">
            {migration.fulfilledWineCount ?? 0} of {migration.rowCount} wines
            created
            {migration.fulfilledAt
              ? ` on ${formatDate(migration.fulfilledAt)}`
              : ""}
            {fulfilledBy ? ` by ${fulfilledBy.name}` : ""}.
          </p>
        </div>
      )}

      {migration.status === "failed" && migration.failureReason && (
        <div className="glass-card p-5 mb-6 border border-danger/20">
          <p className="text-[10px] uppercase tracking-wider text-danger mb-1">
            Marked as needs attention
          </p>
          <p className="text-sm text-secondary">{migration.failureReason}</p>
        </div>
      )}

      {migration.status === "cancelled" && (
        <div className="glass-card p-5 mb-6 border border-muted/20">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Cancelled by member
          </p>
          <p className="text-sm text-secondary">
            {migration.cancelledAt ? formatDate(migration.cancelledAt) : ""}
          </p>
        </div>
      )}

      <AdminMigrationActions
        id={migration.id}
        status={migration.status}
        rowCount={migration.rowCount}
        headers={headers}
        initialMapping={mapping}
      />

      {rows.length > 0 && (
        <div className="mt-8">
          <h2 className="font-serif text-xl text-primary mb-3">Raw rows</h2>
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b border-[#2A2A30]/50 text-[10px] uppercase tracking-wider text-muted">
                  {headers.map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-[#2A2A30]/30 last:border-0"
                  >
                    {headers.map((h) => (
                      <td
                        key={h}
                        className="px-3 py-2 text-secondary max-w-[220px] truncate"
                        title={row[h] ?? ""}
                      >
                        {row[h] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > visibleRows.length && (
            <p className="text-[11px] text-muted mt-2">
              Showing {visibleRows.length} of {rows.length}. Use{" "}
              <Link
                href={`/admin/migrations/${migration.id}/export`}
                prefetch={false}
                className="text-gold hover:underline"
              >
                Export payload
              </Link>{" "}
              for the full CSV.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
