"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { UuidSchema, PriceSchema, parseOr400 } from "@/lib/schemas";
import { DispositionGuardError } from "@/lib/disposition-guard";
import {
  deleteObject,
  extensionForType,
  getPublicUrl,
  getUploadUrl,
  isAllowedImageType,
} from "@/lib/s3";

const VALID_TYPES = ["sold", "transferred", "consumed", "gifted", "removed"] as const;

const DispositionFormSchema = z
  .object({
    wineId: UuidSchema,
    type: z.enum(VALID_TYPES),
    date: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v) : new Date()))
      .refine((d) => !isNaN(d.getTime()), "Invalid date"),
    salePrice: z.preprocess(
      (v) => (v === null || v === "" || v === undefined ? undefined : v),
      z.coerce.number().pipe(PriceSchema).optional(),
    ),
    recipient: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() || null : null),
      z.string().max(200).nullable(),
    ),
    notes: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() || null : null),
      z.string().max(2000).nullable(),
    ),
  })
  // A "sold" disposition without a sale price is almost always a form
  // mistake — the audit trail for valuations downstream depends on it.
  .refine((d) => d.type !== "sold" || d.salePrice != null, {
    message: "Sale price is required when marking a wine as sold",
    path: ["salePrice"],
  });

/* ------------------------------------------------------------------ */
/*  Image upload (feature #18)                                         */
/* ------------------------------------------------------------------ */

export interface UploadUrlResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

/**
 * Request a presigned PUT URL so the browser can upload a wine photo
 * directly to S3. Validates the wine belongs to the caller and that the
 * mime type is on the whitelist before signing anything.
 */
export async function requestWineUploadUrl(
  wineId: string,
  contentType: string,
): Promise<UploadUrlResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Cap presigned-URL signing so a misbehaving client (or attacker) can't
  // burn AWS API quota or make the bucket fanout expensive. Mirrors the
  // limit on `requestScanUploadUrl` in label-scan-actions.ts.
  const ip = clientIp(headers());
  const limit = await checkRateLimit(
    `wine-upload:${session.user.id}:${ip}`,
    { limit: 10, windowMs: 60_000 },
  );
  if (!limit.allowed) throw new Error("Too many upload requests — try again in a minute");

  if (typeof wineId !== "string" || wineId.length === 0) {
    throw new Error("Wine ID is required");
  }
  if (!isAllowedImageType(contentType)) {
    throw new Error("Unsupported image type. Use JPEG, PNG, or WebP.");
  }

  // Ownership check — never trust the client-supplied wineId.
  const wine = await prisma.wine.findUnique({
    where: { id: wineId, memberId: session.user.id },
    select: { id: true },
  });
  if (!wine) throw new Error("Wine not found");

  const ext = extensionForType(contentType);
  const key = `wines/${session.user.id}/${wineId}/${randomUUID()}.${ext}`;
  const uploadUrl = await getUploadUrl(key, contentType);
  if (!uploadUrl) {
    throw new Error(
      "Image upload is not configured on this server. Set AWS_S3_BUCKET to enable.",
    );
  }

  const publicUrl = getPublicUrl(key);
  if (!publicUrl) {
    // Should never happen — getUploadUrl returning a value means a bucket is set.
    throw new Error("Image upload misconfigured: cannot resolve public URL");
  }

  return { uploadUrl, key, publicUrl };
}

/**
 * Persist the S3 object key on the wine row after a successful upload.
 * Re-checks ownership so a leaked client call cannot rewrite someone
 * else's photo.
 */
export async function setWineImage(
  wineId: string,
  key: string,
): Promise<{ publicUrl: string }> {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  if (typeof wineId !== "string" || wineId.length === 0) {
    throw new Error("Wine ID is required");
  }
  if (typeof key !== "string" || key.length === 0 || key.length > 512) {
    throw new Error("Invalid object key");
  }
  // The key must live under this member's prefix — defends against a
  // client passing a key that targets another member's photo.
  const expectedPrefix = `wines/${session.user.id}/${wineId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error("Invalid object key for this wine");
  }

  const wine = await prisma.wine.findUnique({
    where: { id: wineId, memberId: session.user.id },
    select: { id: true, imageKey: true },
  });
  if (!wine) throw new Error("Wine not found");

  const oldKey = wine.imageKey;

  await prisma.wine.update({
    where: { id: wineId },
    data: { imageKey: key },
  });

  // Best-effort cleanup of the previous photo so replacing a bottle image
  // doesn't leak S3 objects. Runs outside any transaction — a delete failure
  // just means one orphaned object, not a stuck write.
  if (oldKey && oldKey !== key) {
    void deleteObject(oldKey);
  }

  revalidatePath(`/wine/${wineId}`);
  revalidatePath("/collection");

  const publicUrl = getPublicUrl(key);
  if (!publicUrl) throw new Error("Image upload misconfigured: cannot resolve public URL");
  return { publicUrl };
}

export async function recordDisposition(formData: FormData) {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not found");

  const ip = clientIp(headers());
  const limit = await checkRateLimit(
    `disposition:${session.user.id}:${ip}`,
    { limit: 30, windowMs: 60_000 },
  );
  if (!limit.allowed) throw new Error("Too many requests");

  const parsed = parseOr400(DispositionFormSchema, {
    wineId: formData.get("wineId"),
    type: formData.get("type"),
    date: formData.get("date") ?? undefined,
    salePrice: formData.get("salePrice"),
    recipient: formData.get("recipient"),
    notes: formData.get("notes"),
  });
  if (!parsed.ok) throw new Error("Invalid disposition data");
  const { wineId, type, date, recipient, notes } = parsed.data;
  const salePrice = type === "sold" ? parsed.data.salePrice ?? null : null;

  // Capture imageKey BEFORE the transaction so we can clean up S3 after the
  // wine row has been updated. We do the delete outside the transaction so a
  // slow/failing S3 call never holds a database write lock.
  let imageKeyToDelete: string | null = null;

  // The status transition is the source of truth for "can we dispose this
  // wine". Two concurrent requests that both read status == 'in_cellar'
  // then both write would race; updateMany with a status predicate makes
  // the check and the write atomic — whichever transaction gets there
  // second finds 0 rows and we surface an already_disposed error.
  await prisma.$transaction(async (tx) => {
    const wine = await tx.wine.findFirst({
      where: { id: wineId, memberId: session.user.id },
      select: { id: true, imageKey: true },
    });
    if (!wine) {
      throw new DispositionGuardError("not_found", "Not found");
    }
    imageKeyToDelete = wine.imageKey;

    const updated = await tx.wine.updateMany({
      where: { id: wineId, memberId: session.user.id, status: "in_cellar" },
      data: { status: type, imageKey: null },
    });
    if (updated.count === 0) {
      throw new DispositionGuardError("already_disposed", "Wine already disposed");
    }

    await tx.wineDisposition.create({
      data: {
        wineId,
        memberId: session.user.id,
        type,
        date,
        salePrice,
        recipient,
        notes,
      },
    });
  });

  // Best-effort S3 cleanup. A failure here just leaks a single object;
  // the database is already in the correct state.
  if (imageKeyToDelete) {
    void deleteObject(imageKeyToDelete);
  }

  revalidatePath(`/wine/${wineId}`);
  revalidatePath("/collection");
  revalidatePath("/");
}
