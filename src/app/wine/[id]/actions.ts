"use server";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  extensionForType,
  getPublicUrl,
  getUploadUrl,
  isAllowedImageType,
} from "@/lib/s3";

const VALID_TYPES = ["sold", "transferred", "consumed", "gifted", "removed"] as const;

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
    select: { id: true },
  });
  if (!wine) throw new Error("Wine not found");

  await prisma.wine.update({
    where: { id: wineId },
    data: { imageKey: key },
  });

  revalidatePath(`/wine/${wineId}`);
  revalidatePath("/collection");

  const publicUrl = getPublicUrl(key);
  if (!publicUrl) throw new Error("Image upload misconfigured: cannot resolve public URL");
  return { publicUrl };
}

export async function recordDisposition(formData: FormData) {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const wineId = formData.get("wineId") as string | null;
  const typeRaw = formData.get("type") as string | null;
  const dateRaw = formData.get("date") as string | null;
  const salePriceRaw = formData.get("salePrice") as string | null;
  const recipient = (formData.get("recipient") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  if (!wineId) throw new Error("Wine ID is required");
  if (!typeRaw || !VALID_TYPES.includes(typeRaw as typeof VALID_TYPES[number])) {
    throw new Error("Invalid disposition type");
  }

  const type = typeRaw as typeof VALID_TYPES[number];

  const dateVal = dateRaw ? new Date(dateRaw) : new Date();
  if (isNaN(dateVal.getTime())) throw new Error("Invalid date");

  let salePrice: number | null = null;
  if (type === "sold" && salePriceRaw) {
    salePrice = parseFloat(salePriceRaw);
    if (isNaN(salePrice) || salePrice < 0 || salePrice > 10_000_000) {
      throw new Error("Invalid sale price");
    }
  }

  // Map disposition type to wine status
  const statusMap: Record<string, "sold" | "transferred" | "consumed" | "gifted" | "removed"> = {
    sold: "sold",
    transferred: "transferred",
    consumed: "consumed",
    gifted: "gifted",
    removed: "removed",
  };

  // Verify ownership and update atomically inside a transaction
  await prisma.$transaction(async (tx) => {
    const wine = await tx.wine.findUnique({
      where: { id: wineId, memberId: session.user.id },
      select: { id: true, status: true },
    });
    if (!wine) throw new Error("Wine not found");
    if (wine.status !== "in_cellar") throw new Error("Wine is already disposed");

    await tx.wineDisposition.create({
      data: {
        wineId,
        memberId: session.user.id,
        type,
        date: dateVal,
        salePrice,
        recipient,
        notes,
      },
    });

    await tx.wine.update({
      where: { id: wineId },
      data: { status: statusMap[type] },
    });
  });

  revalidatePath(`/wine/${wineId}`);
  revalidatePath("/collection");
  revalidatePath("/");
}
