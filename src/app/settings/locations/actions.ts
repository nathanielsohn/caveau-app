"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { FACILITY_COOKIE, signValue } from "@/lib/current-facility";
import { UuidSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";

const PRIVATE_LOCATION_LIMIT = 10;

const PrivateLocationKindSchema = z.enum([
  "residence",
  "restaurant",
  "retail",
  "hospitality",
  "office",
  "warehouse",
  "other",
]);

const OptionalElevationSchema = z.preprocess(
  (v) => {
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? Number(trimmed) : undefined;
  },
  z.number().int().min(-500).max(30_000).optional(),
);

const PrivateLocationFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160, "Name too long"),
  location: z
    .string()
    .trim()
    .min(1, "Location is required")
    .max(240, "Location is too long"),
  privateLocationKind: PrivateLocationKindSchema,
  elevationFt: OptionalElevationSchema,
});

const UpdatePrivateLocationFormSchema = PrivateLocationFormSchema.extend({
  facilityId: UuidSchema,
});

export interface PrivateLocationFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  message: string | null;
}

export const INITIAL_PRIVATE_LOCATION_FORM_STATE: PrivateLocationFormState = {
  submittedAt: null,
  ok: false,
  error: null,
  message: null,
};

async function requireMemberId(): Promise<string | null> {
  const session = await getServerAuth();
  return session?.user?.id ?? null;
}

function locationCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  };
}

function revalidateLocationSurfaces(facilityId?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/settings/locations");
  revalidatePath("/facility");
  revalidatePath("/sentinel");
  revalidatePath("/admin");
  revalidatePath("/admin/facilities");
  if (facilityId) revalidatePath(`/admin/facilities/${facilityId}`);
}

export async function createPrivateLocation(
  _prev: PrivateLocationFormState,
  formData: FormData,
): Promise<PrivateLocationFormState> {
  const now = Date.now();
  const memberId = await requireMemberId();
  if (!memberId) {
    return { submittedAt: now, ok: false, error: "Not authenticated", message: null };
  }

  const parsed = PrivateLocationFormSchema.safeParse({
    name: formData.get("name"),
    location: formData.get("location"),
    privateLocationKind: formData.get("privateLocationKind"),
    elevationFt: formData.get("elevationFt"),
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid location",
      message: null,
    };
  }

  try {
    const existingCount = await prisma.facility.count({
      where: { type: "private_location", ownerMemberId: memberId },
    });
    if (existingCount >= PRIVATE_LOCATION_LIMIT) {
      return {
        submittedAt: now,
        ok: false,
        error: "You have reached the private location limit.",
        message: null,
      };
    }

    const facility = await prisma.$transaction(async (tx) => {
      return tx.facility.create({
        data: {
          type: "private_location",
          ownerMemberId: memberId,
          privateLocationKind: parsed.data.privateLocationKind,
          name: parsed.data.name,
          location: parsed.data.location,
          elevationFt: parsed.data.elevationFt ?? null,
          members: { create: { memberId } },
          lockers: {
            create: {
              lockerNumber: 1,
              zone: "PL",
              memberId,
            },
          },
        },
        select: { id: true },
      });
    });

    const cookieStore = await cookies();
    cookieStore.set(
      FACILITY_COOKIE,
      signValue(facility.id),
      locationCookieOptions(),
    );

    revalidateLocationSurfaces(facility.id);
    return {
      submittedAt: now,
      ok: true,
      error: null,
      message: "Private location added.",
    };
  } catch (e) {
    logger.error("createPrivateLocation failed", e, {
      action: "createPrivateLocation",
      memberId,
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not add private location. Try again in a moment.",
      message: null,
    };
  }
}

export async function updatePrivateLocation(
  _prev: PrivateLocationFormState,
  formData: FormData,
): Promise<PrivateLocationFormState> {
  const now = Date.now();
  const memberId = await requireMemberId();
  if (!memberId) {
    return { submittedAt: now, ok: false, error: "Not authenticated", message: null };
  }

  const parsed = UpdatePrivateLocationFormSchema.safeParse({
    facilityId: formData.get("facilityId"),
    name: formData.get("name"),
    location: formData.get("location"),
    privateLocationKind: formData.get("privateLocationKind"),
    elevationFt: formData.get("elevationFt"),
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid location",
      message: null,
    };
  }

  try {
    const existing = await prisma.facility.findFirst({
      where: {
        id: parsed.data.facilityId,
        type: "private_location",
        ownerMemberId: memberId,
      },
      select: {
        id: true,
        location: true,
        elevationFt: true,
      },
    });
    if (!existing) {
      return {
        submittedAt: now,
        ok: false,
        error: "Private location not found.",
        message: null,
      };
    }

    const physicalChanged =
      existing.location !== parsed.data.location ||
      (existing.elevationFt ?? null) !== (parsed.data.elevationFt ?? null);

    await prisma.facility.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        location: parsed.data.location,
        privateLocationKind: parsed.data.privateLocationKind,
        elevationFt: parsed.data.elevationFt ?? null,
        ...(physicalChanged && { privateLocationCertifiedAt: null }),
      },
    });

    revalidateLocationSurfaces(existing.id);
    return {
      submittedAt: now,
      ok: true,
      error: null,
      message: physicalChanged
        ? "Location updated. Certification was reset."
        : "Location updated.",
    };
  } catch (e) {
    logger.error("updatePrivateLocation failed", e, {
      action: "updatePrivateLocation",
      memberId,
      facilityId: parsed.data.facilityId,
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not update private location. Try again in a moment.",
      message: null,
    };
  }
}

export async function removePrivateLocation(
  _prev: PrivateLocationFormState,
  formData: FormData,
): Promise<PrivateLocationFormState> {
  const now = Date.now();
  const memberId = await requireMemberId();
  if (!memberId) {
    return { submittedAt: now, ok: false, error: "Not authenticated", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("facilityId"));
  if (!idCheck.success) {
    return { submittedAt: now, ok: false, error: "Invalid location", message: null };
  }

  try {
    const facility = await prisma.facility.findFirst({
      where: {
        id: idCheck.data,
        type: "private_location",
        ownerMemberId: memberId,
      },
      select: {
        id: true,
        privateLocationCertifiedAt: true,
        lockers: {
          select: {
            id: true,
            _count: {
              select: {
                slots: true,
                readings: true,
                alerts: true,
                sentinelDevices: true,
              },
            },
          },
        },
        _count: {
          select: {
            sentinelDevices: true,
            events: true,
            hurricaneProtocols: true,
            tastingEvents: true,
          },
        },
      },
    });
    if (!facility) {
      return {
        submittedAt: now,
        ok: false,
        error: "Private location not found.",
        message: null,
      };
    }

    const hasHistory =
      Boolean(facility.privateLocationCertifiedAt) ||
      facility._count.sentinelDevices > 0 ||
      facility._count.events > 0 ||
      facility._count.hurricaneProtocols > 0 ||
      facility._count.tastingEvents > 0 ||
      facility.lockers.some(
        (l) =>
          l._count.slots > 0 ||
          l._count.readings > 0 ||
          l._count.alerts > 0 ||
          l._count.sentinelDevices > 0,
      );
    if (hasHistory) {
      return {
        submittedAt: now,
        ok: false,
        error: "This location has certification or monitoring history. Contact support to remove it.",
        message: null,
      };
    }

    await prisma.$transaction([
      prisma.locker.deleteMany({ where: { facilityId: facility.id } }),
      prisma.facility.delete({ where: { id: facility.id } }),
    ]);

    const fallback = await prisma.facilityMember.findFirst({
      where: {
        memberId,
        OR: [
          { facility: { type: "vault" } },
          { facility: { type: "private_location", ownerMemberId: memberId } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { facilityId: true },
    });
    const cookieStore = await cookies();
    if (fallback) {
      cookieStore.set(
        FACILITY_COOKIE,
        signValue(fallback.facilityId),
        locationCookieOptions(),
      );
    } else {
      cookieStore.delete(FACILITY_COOKIE);
    }

    revalidateLocationSurfaces(facility.id);
    return {
      submittedAt: now,
      ok: true,
      error: null,
      message: "Private location removed.",
    };
  } catch (e) {
    logger.error("removePrivateLocation failed", e, {
      action: "removePrivateLocation",
      memberId,
      facilityId: idCheck.data,
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not remove private location. Try again in a moment.",
      message: null,
    };
  }
}

export async function openPrivateLocation(formData: FormData): Promise<void> {
  const memberId = await requireMemberId();
  if (!memberId) redirect("/auth/login");

  const idCheck = UuidSchema.safeParse(formData.get("facilityId"));
  if (!idCheck.success) redirect("/settings/locations");

  const membership = await prisma.facilityMember.findUnique({
    where: {
      memberId_facilityId: {
        memberId,
        facilityId: idCheck.data,
      },
    },
    select: {
      facilityId: true,
      facility: { select: { type: true, ownerMemberId: true } },
    },
  });

  if (
    !membership ||
    (membership.facility.type === "private_location" &&
      membership.facility.ownerMemberId !== memberId)
  ) {
    redirect("/settings/locations");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    FACILITY_COOKIE,
    signValue(membership.facilityId),
    locationCookieOptions(),
  );
  revalidatePath("/", "layout");
  redirect("/facility");
}
