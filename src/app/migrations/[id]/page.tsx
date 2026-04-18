import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, FileInput, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { MigrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { UuidSchema } from "@/lib/schemas";
import {
  CAVEAU_FIELDS,
  CAVEAU_FIELD_LABELS,
  type CaveauField,
  type ColumnMapping,
} from "@/lib/migration-mapping";
import CancelMigrationButton from "./cancel-migration-button";

export const dynamic = "force-dynamic";

const SOURCE_LABELS = {
  cellartracker: "CellarTracker",
  vivino: "Vivino",
  other: "Custom CSV",
} as const;

export default async function MigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const { id } = await params;
  const idCheck = UuidSchema.safeParse(id);
  if (!idCheck.success) notFound();

  const migration = await prisma.migrationRequest.findUnique({
    where: { id: idCheck.data },
  });
  if (!migration || migration.memberId !== session.user.id) notFound();

  const mapping = (migration.columnMapping as ColumnMapping) ?? {};
  const rows = (migration.rows as Record<string, string>[]) ?? [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/migrations"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All migrations
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <FileInput className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">
              {SOURCE_LABELS[migration.source]} migration
            </h1>
            <p className="text-sm text-muted">
              {migration.originalFilename} · {migration.rowCount}{" "}
              {migration.rowCount === 1 ? "row" : "rows"} · submitted{" "}
              {formatDate(migration.createdAt)}
            </p>
          </div>
        </div>

        {migration.status === "submitted" && (
          <CancelMigrationButton id={migration.id} />
        )}
      </div>

      <StatusCard status={migration.status} migration={migration} />

      {migration.note && (
        <div className="glass-card p-5 mt-5">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Note to concierge
          </p>
          <p className="text-sm text-secondary whitespace-pre-wrap">
            {migration.note}
          </p>
        </div>
      )}

      <div className="mt-6">
        <h2 className="font-serif text-xl text-primary mb-3">Column mapping</h2>
        <div className="glass-card p-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAVEAU_FIELDS.map((field) => (
              <div key={field} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-muted">
                  {CAVEAU_FIELD_LABELS[field]}
                </dt>
                <dd className="text-sm text-primary font-mono truncate">
                  {mapping[field as CaveauField] ?? (
                    <span className="text-muted italic">not mapped</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-6">
          <h2 className="font-serif text-xl text-primary mb-3">
            Uploaded rows ({rows.length})
          </h2>
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
                {rows.slice(0, 50).map((row, idx) => (
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
          {rows.length > 50 && (
            <p className="text-[11px] text-muted mt-2">
              Showing 50 of {rows.length}. The concierge team reviews the full
              file.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  status,
  migration,
}: {
  status: MigrationStatus;
  migration: {
    fulfilledAt: Date | null;
    fulfilledWineCount: number | null;
    rowCount: number;
    failureReason: string | null;
    cancelledAt: Date | null;
  };
}) {
  if (status === "submitted") {
    return (
      <div className="glass-card p-6 border border-gold/20">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-primary font-medium">
              Pending · 48-hour turnaround
            </p>
            <p className="text-sm text-muted mt-1">
              Our concierge team will review your mapping, add your bottles to
              your Caveau collection, and email you when complete. You can
              cancel anytime before fulfillment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "fulfilled") {
    return (
      <div className="glass-card p-6 border border-ok/20">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-primary font-medium">Fulfilled</p>
            <p className="text-sm text-muted mt-1">
              {migration.fulfilledWineCount ?? 0} of {migration.rowCount}{" "}
              bottles added to your collection
              {migration.fulfilledAt
                ? ` on ${formatDate(migration.fulfilledAt)}`
                : ""}
              . Visit{" "}
              <Link href="/collection" className="text-gold hover:underline">
                your collection
              </Link>{" "}
              to assign locker slots.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="glass-card p-6 border border-danger/20">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-primary font-medium">Needs attention</p>
            <p className="text-sm text-muted mt-1">
              {migration.failureReason ??
                "The concierge team flagged an issue with this file. Start a new migration to try again."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 border border-muted/20">
      <div className="flex items-start gap-3">
        <XCircle className="w-5 h-5 text-muted flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-primary font-medium">Cancelled</p>
          <p className="text-sm text-muted mt-1">
            Cancelled{" "}
            {migration.cancelledAt ? formatDate(migration.cancelledAt) : ""}.
            Nothing was added to your collection.
          </p>
        </div>
      </div>
    </div>
  );
}
