import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Events & Tastings · Caveau",
  description:
    "Upcoming tastings, dinners, and member events hosted by Caveau in Naples, Florida.",
};

export const dynamic = "force-dynamic";

function formatDateRange(start: Date, end: Date): string {
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export default async function EventsListPage() {
  const session = await getServerAuth();
  const isAuthed = Boolean(session?.user?.id);

  const events = await prisma.event.findMany({
    where: {
      status: "published",
      endsAt: { gte: new Date() },
      ...(isAuthed ? {} : { memberOnly: false }),
    },
    orderBy: { startsAt: "asc" },
    include: {
      _count: { select: { rsvps: { where: { cancelledAt: null } } } },
    },
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
          Upcoming
        </p>
        <h1 className="font-serif text-3xl md:text-4xl text-primary tracking-wide">
          Events & Tastings
        </h1>
        <p className="text-sm text-secondary mt-2 max-w-xl">
          Curated dinners, tastings, and the Naples Winter Wine Festival.
          Members RSVP in one tap; guests may request an invitation.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No upcoming events yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((e) => {
            const price = toNumber(e.priceUsd);
            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="group glass-card p-6 hover:border-gold/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-medium">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {formatDateRange(e.startsAt, e.endsAt)}
                  </div>
                  {e.memberOnly && (
                    <span className="text-[10px] uppercase tracking-widest text-burgundy">
                      Members only
                    </span>
                  )}
                </div>

                <h2 className="font-serif text-xl text-primary group-hover:text-gold-text transition-colors">
                  {e.title}
                </h2>
                {e.summary && (
                  <p className="text-sm text-secondary mt-2 line-clamp-2">
                    {e.summary}
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-[#2A2A30]/50 flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <MapPin className="w-3.5 h-3.5" />
                    {e.locationName}
                  </span>
                  <span className="text-gold-text font-medium">
                    {price > 0 ? formatCurrency(price) : "Complimentary"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
