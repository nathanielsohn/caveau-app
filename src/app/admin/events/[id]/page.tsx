import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Users, UserPlus } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate, formatCurrency, toNumber } from "@/lib/utils";
import EditEventForm from "./edit-event-form";

export const dynamic = "force-dynamic";

export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      rsvps: {
        where: { cancelledAt: null },
        include: {
          member: { select: { name: true, email: true, tier: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      signups: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!event) notFound();

  const totalSeats = event.rsvps.reduce((sum, r) => sum + r.seats, 0);
  const spotsRemaining = Math.max(0, event.capacity - totalSeats);

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All events
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-primary">{event.title}</h1>
          <p className="text-sm text-muted mt-1">
            {formatDate(event.startsAt)} · {event.locationName} ·{" "}
            {toNumber(event.priceUsd) > 0
              ? formatCurrency(event.priceUsd)
              : "Complimentary"}
          </p>
        </div>

        <Link
          href={`/admin/events/${event.id}/export`}
          prefetch={false}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export roster
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat
          icon={<Users className="w-4 h-4 text-gold" />}
          label="Seats taken"
          value={`${totalSeats} / ${event.capacity}`}
        />
        <Stat
          icon={<UserPlus className="w-4 h-4 text-gold" />}
          label="Members RSVPd"
          value={String(event.rsvps.length)}
        />
        <Stat
          icon={<UserPlus className="w-4 h-4 text-gold" />}
          label="Guest leads"
          value={String(event.signups.length)}
        />
      </div>

      <div className="mb-8 glass-card p-6 md:p-8">
        <h2 className="font-serif text-xl text-primary mb-4">Event details</h2>
        <EditEventForm
          id={event.id}
          initial={{
            title: event.title,
            slug: event.slug,
            summary: event.summary,
            description: event.description,
            locationName: event.locationName,
            locationAddr: event.locationAddr,
            startsAt: event.startsAt.toISOString().slice(0, 16),
            endsAt: event.endsAt.toISOString().slice(0, 16),
            capacity: event.capacity,
            priceUsd: Number(event.priceUsd),
            memberOnly: event.memberOnly,
            status: event.status,
          }}
        />
      </div>

      <div className="mb-6">
        <h2 className="font-serif text-xl text-primary mb-3">
          Member RSVPs ({event.rsvps.length})
        </h2>
        {event.rsvps.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-muted">
            No member RSVPs yet.
          </div>
        ) : (
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                  <th className="text-left px-4 py-3 font-medium">Member</th>
                  <th className="text-left px-4 py-3 font-medium">Tier</th>
                  <th className="text-left px-4 py-3 font-medium">Seats</th>
                  <th className="text-left px-4 py-3 font-medium">Notes</th>
                  <th className="text-left px-4 py-3 font-medium">RSVPd</th>
                </tr>
              </thead>
              <tbody>
                {event.rsvps.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-primary">{r.member.name}</p>
                      <a
                        href={`mailto:${r.member.email}`}
                        className="text-xs text-muted hover:text-gold"
                      >
                        {r.member.email}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-secondary capitalize">
                      {r.member.tier}
                    </td>
                    <td className="px-4 py-3 text-secondary">{r.seats}</td>
                    <td className="px-4 py-3 text-secondary max-w-xs truncate">
                      {r.notes ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="font-serif text-xl text-primary mb-3">
          Guest leads ({event.signups.length})
        </h2>
        {event.signups.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-muted">
            No guest signups yet.
          </div>
        ) : (
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium">Notes</th>
                  <th className="text-left px-4 py-3 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {event.signups.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-primary">{s.name}</td>
                    <td className="px-4 py-3 text-secondary">
                      <a
                        href={`mailto:${s.email}`}
                        className="hover:text-gold transition-colors"
                      >
                        {s.email}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {s.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-secondary max-w-xs truncate">
                      {s.notes ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {formatDate(s.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        {spotsRemaining} of {event.capacity} seats still open.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider text-muted">
          {label}
        </p>
      </div>
      <p className="font-serif text-2xl text-primary">{value}</p>
    </div>
  );
}
