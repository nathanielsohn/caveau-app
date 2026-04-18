"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { CreateEventBodySchema, UuidSchema } from "@/lib/schemas";

export interface EventFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
}

export const INITIAL_EVENT_FORM_STATE: EventFormState = {
  submittedAt: null,
  ok: false,
  error: null,
};

async function requireAdmin(): Promise<string | null> {
  const session = await getServerAuth();
  if (!session?.user?.id) return null;
  if (session.user.role !== Role.admin) return null;
  return session.user.id;
}

function readBody(formData: FormData) {
  return {
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary") ?? undefined,
    description: formData.get("description") ?? undefined,
    locationName: formData.get("locationName"),
    locationAddr: formData.get("locationAddr") ?? undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    capacity: formData.get("capacity"),
    priceUsd: formData.get("priceUsd"),
    memberOnly: formData.get("memberOnly") ?? false,
    status: formData.get("status") ?? "published",
  };
}

export async function createEvent(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const now = Date.now();
  try {
    const adminId = await requireAdmin();
    if (!adminId) {
      return { submittedAt: now, ok: false, error: "Forbidden" };
    }

    const parsed = CreateEventBodySchema.safeParse(readBody(formData));
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const data = parsed.data;

    try {
      await prisma.event.create({
        data: {
          title: data.title,
          slug: data.slug,
          summary: data.summary,
          description: data.description,
          locationName: data.locationName,
          locationAddr: data.locationAddr,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          capacity: data.capacity,
          priceUsd: data.priceUsd,
          memberOnly: data.memberOnly,
          status: data.status,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return {
          submittedAt: now,
          ok: false,
          error: "An event with that slug already exists.",
        };
      }
      throw e;
    }

    revalidatePath("/admin/events");
    revalidatePath("/events");
  } catch (e) {
    logger.error("createEvent failed", e, { action: "createEvent" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not create event. Please try again in a moment.",
    };
  }
  redirect("/admin/events");
}

export async function updateEvent(
  id: string,
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const now = Date.now();
  try {
    const adminId = await requireAdmin();
    if (!adminId) {
      return { submittedAt: now, ok: false, error: "Forbidden" };
    }

    const idCheck = UuidSchema.safeParse(id);
    if (!idCheck.success) {
      return { submittedAt: now, ok: false, error: "Invalid event id" };
    }

    const parsed = CreateEventBodySchema.safeParse(readBody(formData));
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const data = parsed.data;

    try {
      await prisma.event.update({
        where: { id },
        data: {
          title: data.title,
          slug: data.slug,
          summary: data.summary,
          description: data.description,
          locationName: data.locationName,
          locationAddr: data.locationAddr,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          capacity: data.capacity,
          priceUsd: data.priceUsd,
          memberOnly: data.memberOnly,
          status: data.status,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return {
          submittedAt: now,
          ok: false,
          error: "Another event already uses that slug.",
        };
      }
      throw e;
    }

    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${id}`);
    revalidatePath(`/events/${data.slug}`);
    revalidatePath("/events");

    return { submittedAt: now, ok: true, error: null };
  } catch (e) {
    logger.error("updateEvent failed", e, { action: "updateEvent" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not update event. Please try again in a moment.",
    };
  }
}
