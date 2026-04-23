"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  MigrationUpdateMappingBodySchema,
  MigrationFailBodySchema,
  UuidSchema,
} from "@/lib/schemas";
import {
  CAVEAU_REQUIRED_FIELDS,
  type CaveauField,
  type ColumnMapping,
} from "@/lib/migration-mapping";

export interface AdminMigrationFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  message: string | null;
}

export const INITIAL_ADMIN_MIGRATION_STATE: AdminMigrationFormState = {
  submittedAt: null,
  ok: false,
  error: null,
  message: null,
};

async function requireAdminId(): Promise<string | null> {
  const session = await getServerAuth();
  if (!session?.user?.id) return null;
  if (session.user.role !== Role.admin) return null;
  return session.user.id;
}

export async function updateMigrationMapping(
  _prev: AdminMigrationFormState,
  formData: FormData,
): Promise<AdminMigrationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return {
      submittedAt: now,
      ok: false,
      error: "Forbidden",
      message: null,
    };
  }

  const idCheck = UuidSchema.safeParse(formData.get("id"));
  if (!idCheck.success) {
    return { submittedAt: now, ok: false, error: "Invalid id", message: null };
  }

  const rawMapping = formData.get("columnMapping");
  if (typeof rawMapping !== "string") {
    return {
      submittedAt: now,
      ok: false,
      error: "Missing mapping payload",
      message: null,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMapping);
  } catch {
    return {
      submittedAt: now,
      ok: false,
      error: "Malformed mapping",
      message: null,
    };
  }
  const result = MigrationUpdateMappingBodySchema.safeParse({
    columnMapping: parsed,
  });
  if (!result.success) {
    return {
      submittedAt: now,
      ok: false,
      error: result.error.issues[0]?.message ?? "Invalid mapping",
      message: null,
    };
  }

  try {
    const migration = await prisma.migrationRequest.findUnique({
      where: { id: idCheck.data },
      select: { status: true },
    });
    if (!migration) {
      return {
        submittedAt: now,
        ok: false,
        error: "Migration not found",
        message: null,
      };
    }
    if (migration.status !== "submitted") {
      return {
        submittedAt: now,
        ok: false,
        error: "Only pending migrations can be edited.",
        message: null,
      };
    }

    await prisma.migrationRequest.update({
      where: { id: idCheck.data },
      data: { columnMapping: result.data.columnMapping },
    });
  } catch (e) {
    logger.error("updateMigrationMapping failed", e, {
      action: "updateMigrationMapping",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not save mapping.",
      message: null,
    };
  }

  revalidatePath(`/admin/migrations/${idCheck.data}`);
  return { submittedAt: now, ok: true, error: null, message: "Mapping saved." };
}

export async function fulfillMigration(
  _prev: AdminMigrationFormState,
  formData: FormData,
): Promise<AdminMigrationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("id"));
  if (!idCheck.success) {
    return { submittedAt: now, ok: false, error: "Invalid id", message: null };
  }
  const id = idCheck.data;

  let createdCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const migration = await tx.migrationRequest.findUnique({ where: { id } });
      if (!migration) throw new InvalidStateError("Migration not found");
      if (migration.status !== "submitted") {
        throw new InvalidStateError(
          "Only pending migrations can be fulfilled.",
        );
      }

      const mapping = (migration.columnMapping as ColumnMapping) ?? {};
      for (const field of CAVEAU_REQUIRED_FIELDS) {
        if (!mapping[field]) {
          throw new InvalidStateError(
            `Map the "${field}" field before fulfilling.`,
          );
        }
      }

      const rows = (migration.rows as Record<string, string>[]) ?? [];
      const pick = (row: Record<string, string>, field: CaveauField) => {
        const key = mapping[field];
        return key ? (row[key] ?? "").trim() : "";
      };

      const currentYear = new Date().getFullYear();
      const prepared = rows
        .map((row) => {
          const name = pick(row, "name").slice(0, 500);
          const vintage = parseInt(pick(row, "vintage"), 10);
          const region = pick(row, "region").slice(0, 200) || "Unknown";
          const varietal = pick(row, "varietal").slice(0, 200) || "Unknown";
          const producer = pick(row, "producer").slice(0, 200) || "Unknown";
          const priceRaw = pick(row, "purchasePrice").replace(/[^0-9.\-]/g, "");
          const purchasePrice = parseFloat(priceRaw);
          const tastingNotesRaw = pick(row, "tastingNotes").slice(0, 5000);
          return {
            name,
            vintage,
            region,
            varietal,
            producer,
            purchasePrice: Number.isFinite(purchasePrice)
              ? Math.max(0, purchasePrice)
              : 0,
            tastingNotes: tastingNotesRaw || null,
          };
        })
        .filter(
          (w) =>
            w.name.length > 0 &&
            Number.isFinite(w.vintage) &&
            w.vintage >= 1800 &&
            w.vintage <= currentYear + 1,
        );

      if (prepared.length === 0) {
        throw new InvalidStateError(
          "No rows produced a valid wine. Check the mapping.",
        );
      }

      await tx.wine.createMany({
        data: prepared.map((w) => ({
          ...w,
          currentValue: w.purchasePrice,
          memberId: migration.memberId,
        })),
      });

      // Atomic status transition — two concurrent "fulfill" clicks would
      // otherwise both pass the status check above and both `createMany`
      // under Read Committed, doubling the member's wine rows. The
      // status filter here causes the second transaction's count to be 0
      // and the whole txn (wine inserts included) rolls back.
      const { count } = await tx.migrationRequest.updateMany({
        where: { id, status: "submitted" },
        data: {
          status: "fulfilled",
          fulfilledAt: new Date(),
          fulfilledWineCount: prepared.length,
          fulfilledById: adminId,
        },
      });
      if (count === 0) {
        throw new InvalidStateError(
          "Another admin just fulfilled this migration — refresh the queue.",
        );
      }

      createdCount = prepared.length;
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("fulfillMigration failed", e, { action: "fulfillMigration" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not fulfill. Please try again.",
      message: null,
    };
  }

  revalidatePath("/admin/migrations");
  revalidatePath(`/admin/migrations/${id}`);
  revalidatePath("/migrations");
  revalidatePath(`/migrations/${id}`);
  revalidatePath("/collection");

  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: `Created ${createdCount} ${createdCount === 1 ? "wine" : "wines"}.`,
  };
}

export async function failMigration(
  _prev: AdminMigrationFormState,
  formData: FormData,
): Promise<AdminMigrationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("id"));
  if (!idCheck.success) {
    return { submittedAt: now, ok: false, error: "Invalid id", message: null };
  }
  const body = MigrationFailBodySchema.safeParse({
    failureReason: formData.get("failureReason"),
  });
  if (!body.success) {
    return {
      submittedAt: now,
      ok: false,
      error: body.error.issues[0]?.message ?? "Invalid reason",
      message: null,
    };
  }

  try {
    const migration = await prisma.migrationRequest.findUnique({
      where: { id: idCheck.data },
      select: { status: true },
    });
    if (!migration) {
      return {
        submittedAt: now,
        ok: false,
        error: "Migration not found",
        message: null,
      };
    }
    if (migration.status !== "submitted") {
      return {
        submittedAt: now,
        ok: false,
        error: "Only pending migrations can be marked failed.",
        message: null,
      };
    }

    await prisma.migrationRequest.update({
      where: { id: idCheck.data },
      data: {
        status: "failed",
        failureReason: body.data.failureReason,
      },
    });
  } catch (e) {
    logger.error("failMigration failed", e, { action: "failMigration" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not save. Try again.",
      message: null,
    };
  }

  revalidatePath("/admin/migrations");
  revalidatePath(`/admin/migrations/${idCheck.data}`);
  revalidatePath(`/migrations/${idCheck.data}`);

  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Marked as needs attention.",
  };
}

class InvalidStateError extends Error {}
