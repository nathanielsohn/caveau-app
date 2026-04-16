"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NfcTagTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { parseOr400, UuidSchema } from "@/lib/schemas";
import {
  extensionForType,
  getPublicUrl,
  getUploadUrl,
  isAllowedImageType,
} from "@/lib/s3";

/* ------------------------------------------------------------------ */
/*  Tag ID format                                                      */
/* ------------------------------------------------------------------ */
//
// Physical NFC tags come with a 6–32 char alphanumeric serial printed on
// the protective liner at intake. Staff enter it into the form or scan a
// one-time QR on the liner (the QR goes in the trash — the NFC chip is
// what the public taps). We keep the accepted alphabet permissive so
// different vendor serial schemes work without new code, but block
// characters that would break the URL segment.

const TagIdSchema = z
  .string()
  .trim()
  .min(6, "Tag ID is too short")
  .max(64, "Tag ID is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Tag ID may only contain letters, digits, underscore, or dash");

const AssignTagSchema = z.object({
  wineId: UuidSchema,
  tagId: TagIdSchema,
  tier: z.nativeEnum(NfcTagTier),
  intakeImageKey: z
    .preprocess(
      (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
      z.string().max(512).optional(),
    )
    .optional(),
});

/* ------------------------------------------------------------------ */
/*  Intake photo upload                                                */
/* ------------------------------------------------------------------ */
//
// Staff can attach a photo at the moment of tagging so there's a tamper-
// evidence record (bottle + tag in-frame). We reuse the S3 presigned-URL
// flow from the wine image upload (#18) but keep a separate key prefix so
// the intake photo can be managed independently from the marketing photo.

export interface TagUploadUrlResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

export async function requestTagUploadUrl(
  wineId: string,
  contentType: string,
): Promise<TagUploadUrlResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const ip = clientIp(headers());
  const limit = await checkRateLimit(
    `nfc-upload:${session.user.id}:${ip}`,
    { limit: 10, windowMs: 60_000 },
  );
  if (!limit.allowed) throw new Error("Too many upload requests — try again in a minute");

  if (typeof wineId !== "string" || wineId.length === 0) {
    throw new Error("Wine ID is required");
  }
  if (!isAllowedImageType(contentType)) {
    throw new Error("Unsupported image type. Use JPEG, PNG, or WebP.");
  }

  const wine = await prisma.wine.findUnique({
    where: { id: wineId, memberId: session.user.id },
    select: { id: true },
  });
  if (!wine) throw new Error("Wine not found");

  const ext = extensionForType(contentType);
  const key = `nfc-intake/${session.user.id}/${wineId}/${randomUUID()}.${ext}`;
  const uploadUrl = await getUploadUrl(key, contentType);
  if (!uploadUrl) {
    throw new Error(
      "Image upload is not configured on this server. Set AWS_S3_BUCKET to enable.",
    );
  }
  const publicUrl = getPublicUrl(key);
  if (!publicUrl) {
    throw new Error("Image upload misconfigured: cannot resolve public URL");
  }
  return { uploadUrl, key, publicUrl };
}

/* ------------------------------------------------------------------ */
/*  Assign tag                                                         */
/* ------------------------------------------------------------------ */

export interface AssignTagResult {
  ok: boolean;
  error?: string;
}

export async function assignNfcTag(formData: FormData): Promise<AssignTagResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const ip = clientIp(headers());
  const limit = await checkRateLimit(
    `nfc-assign:${session.user.id}:${ip}`,
    { limit: 30, windowMs: 60_000 },
  );
  if (!limit.allowed) return { ok: false, error: "Too many requests" };

  const parsed = parseOr400(AssignTagSchema, {
    wineId: formData.get("wineId"),
    tagId: formData.get("tagId"),
    tier: formData.get("tier"),
    intakeImageKey: formData.get("intakeImageKey"),
  });
  if (!parsed.ok) {
    return { ok: false, error: "Invalid tag data" };
  }

  const { wineId, tagId, tier, intakeImageKey } = parsed.data;

  // Ownership check — never trust a client-supplied wineId.
  const wine = await prisma.wine.findUnique({
    where: { id: wineId, memberId: session.user.id },
    select: { id: true },
  });
  if (!wine) return { ok: false, error: "Wine not found" };

  // Enforce that the intake image key, if provided, lives under the
  // caller's own member prefix. Defense-in-depth against a crafted client
  // call that tries to point the row at someone else's S3 object.
  const safeImageKey =
    intakeImageKey && intakeImageKey.startsWith(`nfc-intake/${session.user.id}/${wineId}/`)
      ? intakeImageKey
      : null;

  // One tag per bottle at a time. If this wine already has a tag we block
  // with a descriptive error — staff's intended flow is to scan the existing
  // tag instead of orphaning it. Separate query from the create so we can
  // return a clear error message rather than a generic unique-violation.
  const existing = await prisma.nfcTag.findFirst({
    where: { wineId },
    select: { id: true, tagId: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `This bottle is already tagged (${existing.tagId}). Remove the existing tag first.`,
    };
  }

  try {
    await prisma.nfcTag.create({
      data: {
        tagId,
        wineId,
        tier,
        intakeImageKey: safeImageKey,
        activatedAt: new Date(),
      },
    });
  } catch (err) {
    // Unique constraint on tagId — another bottle somewhere already owns
    // this serial. Surface a specific error so staff re-scan rather than
    // assume the form broke.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error: "That tag ID is already in use. Scan the correct tag or contact support.",
      };
    }
    throw err;
  }

  revalidatePath(`/wine/${wineId}`);
  revalidatePath("/collection");
  return { ok: true };
}

export async function removeNfcTag(formData: FormData): Promise<AssignTagResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const ip = clientIp(headers());
  const limit = await checkRateLimit(
    `nfc-remove:${session.user.id}:${ip}`,
    { limit: 30, windowMs: 60_000 },
  );
  if (!limit.allowed) return { ok: false, error: "Too many requests" };

  const parsedId = UuidSchema.safeParse(formData.get("wineId"));
  if (!parsedId.success) return { ok: false, error: "Invalid wine" };
  const wineId = parsedId.data;

  // deleteMany with the ownership predicate in the where clause means we
  // don't need a separate select-then-delete pair — an attacker with a
  // stolen wineId still can't touch someone else's tag.
  const res = await prisma.nfcTag.deleteMany({
    where: { wineId, wine: { memberId: session.user.id } },
  });
  if (res.count === 0) {
    return { ok: false, error: "No tag to remove" };
  }

  revalidatePath(`/wine/${wineId}`);
  revalidatePath("/collection");
  return { ok: true };
}
