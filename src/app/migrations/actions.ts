"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  SubmitMigrationBodySchema,
  UuidSchema,
} from "@/lib/schemas";

export interface MigrationFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
}

export const INITIAL_MIGRATION_FORM_STATE: MigrationFormState = {
  submittedAt: null,
  ok: false,
  error: null,
};

// 1 MiB cap on the parsed JSON payload. Plenty for a 500-row CSV with
// multi-sentence tasting notes; anything larger is almost certainly a
// mismatched file type or a malicious client.
const MAX_PAYLOAD_BYTES = 1_048_576;

export async function submitMigration(
  _prev: MigrationFormState,
  formData: FormData,
): Promise<MigrationFormState> {
  const now = Date.now();

  const session = await getServerAuth();
  if (!session?.user?.id) {
    return { submittedAt: now, ok: false, error: "Not signed in." };
  }
  const memberId = session.user.id;

  const payloadRaw = formData.get("payload");
  if (typeof payloadRaw !== "string") {
    return {
      submittedAt: now,
      ok: false,
      error: "No migration data received. Try uploading again.",
    };
  }
  if (payloadRaw.length > MAX_PAYLOAD_BYTES) {
    return {
      submittedAt: now,
      ok: false,
      error: "Upload is too large. Try trimming to fewer than 500 rows.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadRaw);
  } catch {
    return {
      submittedAt: now,
      ok: false,
      error: "Migration data was malformed. Re-pick the file and try again.",
    };
  }

  const result = SubmitMigrationBodySchema.safeParse(parsed);
  if (!result.success) {
    return {
      submittedAt: now,
      ok: false,
      error: result.error.issues[0]?.message ?? "Invalid migration payload.",
    };
  }
  const body = result.data;

  let newId: string;
  try {
    const created = await prisma.migrationRequest.create({
      data: {
        memberId,
        source: body.source,
        originalFilename: body.originalFilename,
        columnMapping: body.columnMapping,
        rows: body.rows,
        rowCount: body.rows.length,
        note: body.note ?? null,
      },
      select: { id: true },
    });
    newId = created.id;
  } catch (e) {
    logger.error("submitMigration failed", e, { action: "submitMigration" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not submit migration. Please try again in a moment.",
    };
  }

  revalidatePath("/migrations");
  revalidatePath("/admin/migrations");
  redirect(`/migrations/${newId}`);
}

export async function cancelMigration(
  _prev: MigrationFormState,
  formData: FormData,
): Promise<MigrationFormState> {
  const now = Date.now();

  const session = await getServerAuth();
  if (!session?.user?.id) {
    return { submittedAt: now, ok: false, error: "Not signed in." };
  }

  const idRaw = formData.get("id");
  const idCheck = UuidSchema.safeParse(idRaw);
  if (!idCheck.success) {
    return { submittedAt: now, ok: false, error: "Invalid migration id." };
  }

  try {
    const migration = await prisma.migrationRequest.findUnique({
      where: { id: idCheck.data },
      select: { memberId: true, status: true },
    });
    if (!migration || migration.memberId !== session.user.id) {
      // Don't leak existence to a different member.
      return { submittedAt: now, ok: false, error: "Migration not found." };
    }
    if (migration.status !== "submitted") {
      return {
        submittedAt: now,
        ok: false,
        error: "Only pending migrations can be cancelled.",
      };
    }

    await prisma.migrationRequest.update({
      where: { id: idCheck.data },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
  } catch (e) {
    logger.error("cancelMigration failed", e, { action: "cancelMigration" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not cancel. Please try again.",
    };
  }

  revalidatePath("/migrations");
  revalidatePath(`/migrations/${idCheck.data}`);
  revalidatePath("/admin/migrations");
  revalidatePath(`/admin/migrations/${idCheck.data}`);

  return { submittedAt: now, ok: true, error: null };
}
