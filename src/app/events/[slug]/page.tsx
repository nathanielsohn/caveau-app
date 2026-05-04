import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import RsvpForm from "./rsvp-form";
import SignupForm from "./signup-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { title: true, summary: true, status: true, memberOnly: true },
  });
  if (!event || event.status !== "published") {
    return { title: "Event · Caveau" };
  }
  if (event.memberOnly) {
    const session = await getServerAuth();
    if (!session?.user?.id) {
      return { title: "Members-only event · Caveau" };
    }
  }
  return {
    title: `${event.title} · Caveau`,
    description: event.summary ?? undefined,
  };
}

function formatWhen(start: Date, end: Date): string {
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    const time = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const endTime = end.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${formatDate(start)} · ${time}–${endTime}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getServerAuth();
  const memberId = session?.user?.id ?? null;

  const event = await prisma.event.findUnique({
    where: { slug },
    include: {
      _count: { select: { rsvps: { where: { cancelledAt: null } } } },
    },
  });
  if (!event || event.status !== "published") notFound();
  if (event.memberOnly && !memberId) {
    redirect(
      `/auth/login?callbackUrl=${encodeURIComponent(`/events/${event.slug}`)}`,
    );
  }

  // Seats taken sum (accounting for multi-seat RSVPs).
  const takenAgg = await prisma.eventRsvp.aggregate({
    where: { eventId: event.id, cancelledAt: null },
    _sum: { seats: true },
  });
  const taken = takenAgg._sum.seats ?? 0;
  const spotsRemaining = Math.max(0, event.capacity - taken);

  const ownRsvp = memberId
    ? await prisma.eventRsvp.findUnique({
        where: { eventId_memberId: { eventId: event.id, memberId } },
      })
    : null;
  const activeRsvp = ownRsvp && !ownRsvp.cancelledAt ? ownRsvp : null;

  const isPublicEvent = !event.memberOnly;
  const price = toNumber(event.priceUsd);

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All events
      </Link>

      <div className="glass-card p-6 md:p-10 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-medium">
            <CalendarDays className="w-3.5 h-3.5" />
            {formatWhen(event.startsAt, event.endsAt)}
          </div>
          {event.memberOnly && (
            <span className="text-[10px] uppercase tracking-widest text-burgundy">
              Members only
            </span>
          )}
        </div>

        <h1 className="font-serif text-3xl md:text-4xl text-primary leading-tight">
          {event.title}
        </h1>
        {event.summary && (
          <p className="text-secondary mt-3 leading-relaxed">{event.summary}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#2A2A30]/50">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted">
              Location
            </p>
            <p className="text-sm text-primary mt-1 inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gold" />
              {event.locationName}
            </p>
            {event.locationAddr && (
              <p className="text-xs text-muted mt-0.5">{event.locationAddr}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted">
              Price
            </p>
            <p className="font-serif text-xl text-primary mt-1">
              {price > 0 ? formatCurrency(price) : "Complimentary"}
            </p>
            <p className="text-xs text-muted mt-0.5">per seat</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted">
              Availability
            </p>
            <p className="font-serif text-xl text-primary mt-1 inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-gold" />
              {spotsRemaining}
            </p>
            <p className="text-xs text-muted mt-0.5">
              of {event.capacity} seats open
            </p>
          </div>
        </div>

        {event.description && (
          <div className="mt-8 pt-6 border-t border-[#2A2A30]/50">
            <p className="text-sm text-secondary leading-relaxed whitespace-pre-line">
              {event.description}
            </p>
          </div>
        )}
      </div>

      {/* Action card */}
      {memberId ? (
        <RsvpForm
          eventId={event.id}
          spotsRemaining={spotsRemaining}
          initialSeats={activeRsvp?.seats ?? null}
          initialNotes={activeRsvp?.notes ?? null}
        />
      ) : isPublicEvent ? (
        <SignupForm slug={event.slug} />
      ) : (
        <div className="glass-card p-6 md:p-8 text-center">
          <p className="font-serif text-xl text-primary mb-2">
            This is a members-only event.
          </p>
          <p className="text-sm text-secondary mb-6">
            Sign in to your Caveau account to RSVP.
          </p>
          <Link
            href={`/auth/login?callbackUrl=%2Fevents%2F${encodeURIComponent(event.slug)}`}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
