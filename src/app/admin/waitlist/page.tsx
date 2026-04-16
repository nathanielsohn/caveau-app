import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, Users } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminWaitlistPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  // Staff + admins only. Members are redirected to the dashboard so this
  // page can't be used for reconnaissance from a regular account.
  if (
    session.user.role !== Role.admin &&
    session.user.role !== Role.staff
  ) {
    redirect("/");
  }

  const entries = await prisma.waitlist.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const loiCount = entries.filter((e) => e.loiSigned).length;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">
              Founding Member Waitlist
            </h1>
            <p className="text-sm text-muted">
              {entries.length} {entries.length === 1 ? "lead" : "leads"} ·{" "}
              {loiCount} LOI signed
            </p>
          </div>
        </div>

        <Link
          href="/admin/waitlist/export"
          prefetch={false}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Link>
      </div>

      {/* Entries table */}
      {entries.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No waitlist entries yet. Once visitors submit the{" "}
            <Link href="/waitlist" className="text-gold hover:underline">
              /waitlist
            </Link>{" "}
            form, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-left px-4 py-3 font-medium">Referred By</th>
                <th className="text-left px-4 py-3 font-medium">LOI</th>
                <th className="text-left px-4 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                >
                  <td className="px-4 py-3 text-primary">{e.name}</td>
                  <td className="px-4 py-3 text-secondary">
                    <a
                      href={`mailto:${e.email}`}
                      className="hover:text-gold transition-colors"
                    >
                      {e.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-secondary">{e.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-secondary">{e.source ?? "—"}</td>
                  <td className="px-4 py-3 text-secondary">
                    {e.referredBy ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {e.loiSigned ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ok/10 text-ok text-xs font-medium">
                        Signed
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {formatDate(e.createdAt)}
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
