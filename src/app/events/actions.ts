"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { RsvpBodySchema, EventSignupBodySchema } from "@/lib/schemas";

export interface RsvpState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  confirmedSeats: number | null;
  cancelled: boolean;
}

export const INITIAL_RSVP_STATE: RsvpState = {
  submittedAt: null,
  ok: false,
  error: null,
  confirmedSeats: null,
  cancelled: false,
};

export interface EventSignupState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  confirmedName: string | null;
}

export const INITIAL_EVENT_SIGNUP_STATE: EventSignupState = {
  submittedAt: null,
  ok: false,
  error: null,
  confirmedName: null,
};

function remainingSeats(capacity: number, taken: number): number {
  return Math.max(0, capacity - taken);
}

export async function rsvpToEvent(
  _prev: RsvpState,
  formData: FormData,
): Promise<RsvpState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in to RSVP.",
        confirmedSeats: null,
        cancelled: false,
      };
    }

    const parsed = RsvpBodySchema.safeParse({
      eventId: formData.get("eventId"),
      seats: formData.get("seats") ?? 1,
      notes: formData.get("notes") ?? undefined,
    });
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        confirmedSeats: null,
        cancelled: false,
      };
    }
    const { eventId, seats, notes } = parsed.data;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        slug: true,
        capacity: true,
        status: true,
        memberOnly: true,
      },
    });
    if (!event || event.status !== "published") {
      return {
        submittedAt: now,
        ok: false,
        error: "This event is not available.",
        confirmedSeats: null,
        cancelled: false,
      };
    }

    // Capacity check: only active (non-cancelled) RSVPs count. We hold the
    // existing row's seat count in mind so a member editing their own RSVP
    // isn't charged twice against capacity.
    const [takenAgg, existing] = await Promise.all([
      prisma.eventRsvp.aggregate({
        where: { eventId, cancelledAt: null },
        _sum: { seats: true },
      }),
      prisma.eventRsvp.findUnique({
        where: { eventId_memberId: { eventId, memberId } },
        select: { id: true, seats: true, cancelledAt: true },
      }),
    ]);
    const taken = takenAgg._sum.seats ?? 0;
    const ownedSeats =
      existing && !existing.cancelledAt ? existing.seats : 0;
    const free = remainingSeats(event.capacity, taken - ownedSeats);
    if (seats > free) {
      return {
        submittedAt: now,
        ok: false,
        error:
          free === 0
            ? "This event is full."
            : `Only ${free} seat${free === 1 ? "" : "s"} remaining.`,
        confirmedSeats: null,
        cancelled: false,
      };
    }

    await prisma.eventRsvp.upsert({
      where: { eventId_memberId: { eventId, memberId } },
      create: { eventId, memberId, seats, notes },
      update: { seats, notes, cancelledAt: null },
    });

    revalidatePath(`/events/${event.slug}`);
    revalidatePath("/events");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      confirmedSeats: seats,
      cancelled: false,
    };
  } catch (e) {
    logger.error("rsvpToEvent failed", e, { action: "rsvpToEvent" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not RSVP. Please try again in a moment.",
      confirmedSeats: null,
      cancelled: false,
    };
  }
}

export async function cancelRsvp(
  _prev: RsvpState,
  formData: FormData,
): Promise<RsvpState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in to cancel.",
        confirmedSeats: null,
        cancelled: false,
      };
    }

    const eventId = formData.get("eventId");
    if (typeof eventId !== "string") {
      return {
        submittedAt: now,
        ok: false,
        error: "Missing event id.",
        confirmedSeats: null,
        cancelled: false,
      };
    }

    const rsvp = await prisma.eventRsvp.findUnique({
      where: { eventId_memberId: { eventId, memberId } },
      include: { event: { select: { slug: true } } },
    });
    if (!rsvp) {
      return {
        submittedAt: now,
        ok: true,
        error: null,
        confirmedSeats: null,
        cancelled: true,
      };
    }

    await prisma.eventRsvp.update({
      where: { id: rsvp.id },
      data: { cancelledAt: new Date() },
    });

    revalidatePath(`/events/${rsvp.event.slug}`);
    revalidatePath("/events");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      confirmedSeats: null,
      cancelled: true,
    };
  } catch (e) {
    logger.error("cancelRsvp failed", e, { action: "cancelRsvp" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not cancel. Please try again in a moment.",
      confirmedSeats: null,
      cancelled: false,
    };
  }
}

export async function submitEventSignup(
  slug: string,
  _prev: EventSignupState,
  formData: FormData,
): Promise<EventSignupState> {
  const now = Date.now();
  try {
    const event = await prisma.event.findUnique({
      where: { slug },
      select: { id: true, status: true, memberOnly: true },
    });
    if (!event || event.status !== "published" || event.memberOnly) {
      return {
        submittedAt: now,
        ok: false,
        error: "This event is not available.",
        confirmedName: null,
      };
    }

    const parsed = EventSignupBodySchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone") ?? undefined,
      notes: formData.get("notes") ?? undefined,
    });
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        confirmedName: null,
      };
    }
    const data = parsed.data;

    try {
      await prisma.eventSignup.create({
        data: {
          eventId: event.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
          notes: data.notes,
        },
      });
    } catch (e) {
      // Same-event duplicate → idempotent success, same as /waitlist pattern.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return {
          submittedAt: now,
          ok: true,
          error: null,
          confirmedName: data.name,
        };
      }
      throw e;
    }

    return {
      submittedAt: now,
      ok: true,
      error: null,
      confirmedName: data.name,
    };
  } catch (e) {
    logger.error("submitEventSignup failed", e, {
      action: "submitEventSignup",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not submit. Please try again in a moment.",
      confirmedName: null,
    };
  }
}
