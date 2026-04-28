import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileText, Sparkles } from "lucide-react";
import { AppraisalStatus, Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { PURPOSE_LABELS, STATUS_LABELS } from "@/lib/appraisals";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { value: "all" | AppraisalStatus; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const STATUS_STYLES: Record<AppraisalStatus, string> = {
  submitted: "bg-gold/10 text-gold border-gold/30",
  in_progress: "bg-ok/10 text-ok border-ok/30",
  completed: "bg-ok/10 text-ok border-ok/30",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

function resolveStatusFilter(
  raw: string | undefined,
): "all" | AppraisalStatus {
  if (!raw) return "submitted";
  if (raw === "all") return "all";
  if (
    raw === "submitted" ||
    raw === "in_progress" ||
    raw === "completed" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  return "submitted";
}

export default async function AdminAppraisalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const params = await searchParams;
  const filter = resolveStatusFilter(params.status);

  const where: Prisma.AppraisalWhereInput =
    filter === "all" ? {} : { status: filter };

  const [appraisals, counts] = await Promise.all([
    prisma.appraisal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        member: { select: { name: true, email: true, tier: true } },
      },
      take: 200,
    }),
    prisma.appraisal.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map<AppraisalStatus, number>();
  for (const c of counts) byStatus.set(c.status, c._count._all);
  const totalAll = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Appraisals</h1>
            <p className="text-sm text-muted">
              Welcome and paid valuation documents.
            </p>
          </div>
        </div>
        <Link
          href="/admin/appraisals/export"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm hover:border-gold/40 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Link>
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
              href={`/admin/appraisals?status=${f.value}`}
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

      {appraisals.length === 0 ? (
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
                <th className="text-left px-4 py-3 font-medium">Purpose</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Basis total</th>
                <th className="text-left px-4 py-3 font-medium">Price</th>
                <th className="text-left px-4 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {appraisals.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/appraisals/${a.id}`}
                      className="text-primary hover:text-gold transition-colors"
                    >
                      {a.member.name}
                    </Link>
                    <p className="text-[11px] text-muted truncate max-w-[180px]">
                      {a.member.email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    <span className="flex items-center gap-1.5">
                      {PURPOSE_LABELS[a.purpose]}
                      {a.isWelcomeAppraisal && (
                        <Sparkles className="w-3 h-3 text-gold-text" />
                      )}
                    </span>
                    {a.appraisalNumber && (
                      <p className="font-mono text-[11px] text-muted mt-0.5">
                        {a.appraisalNumber}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {a.totalBasisUsd
                      ? formatCurrency(toNumber(a.totalBasisUsd))
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {a.isWelcomeAppraisal
                      ? "Included"
                      : a.priceChargedUsd
                        ? formatCurrency(toNumber(a.priceChargedUsd))
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {formatDate(a.createdAt)}
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
