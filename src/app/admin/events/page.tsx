import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate, formatCurrency, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLES = {
  draft: "bg-muted/10 text-muted border-muted/20",
  published: "bg-ok/10 text-ok border-ok/30",
  cancelled: "bg-danger/10 text-danger border-danger/30",
} as const;

export default async function AdminEventsPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const events = await prisma.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: {
        select: {
          rsvps: { where: { cancelledAt: null } },
          signups: true,
        },
      },
    },
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Events</h1>
            <p className="text-sm text-muted">
              {events.length} {events.length === 1 ? "event" : "events"}
            </p>
          </div>
        </div>

        <Link
          href="/admin/events/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No events yet. Create the first event to seed the public{" "}
            <Link href="/events" className="text-gold hover:underline">
              /events
            </Link>{" "}
            page.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Starts</th>
                <th className="text-left px-4 py-3 font-medium">Capacity</th>
                <th className="text-left px-4 py-3 font-medium">Price</th>
                <th className="text-left px-4 py-3 font-medium">RSVPs</th>
                <th className="text-left px-4 py-3 font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/events/${e.id}`}
                      className="text-primary hover:text-gold transition-colors"
                    >
                      {e.title}
                    </Link>
                    {e.memberOnly && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-burgundy">
                        Members only
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[e.status]}`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {formatDate(e.startsAt)}
                  </td>
                  <td className="px-4 py-3 text-secondary">{e.capacity}</td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {toNumber(e.priceUsd) > 0
                      ? formatCurrency(e.priceUsd)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {e._count.rsvps}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {e._count.signups}
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
