"use server";

/**
 * Server actions backing the wine-label scan flow (feature #24).
 *
 * Two actions:
 *   - requestScanUploadUrl: presigns a PUT URL for a one-shot scan upload.
 *     The wine row doesn't exist yet, so we can't piggyback on
 *     `requestWineUploadUrl` (which requires a wineId for ownership). We
 *     scope the key to `wines/${memberId}/scans/...` so the same prefix
 *     check used elsewhere still works.
 *   - scanWineLabel: takes the uploaded object key, runs Vision OCR on the
 *     public URL, parses the raw text into wine fields, and returns them.
 *
 * Both return discriminated unions so the client never has to wrap a
 * try/catch — error states are first-class values.
 */

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { getServerAuth } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  extensionForType,
  getPublicUrl,
  getUploadUrl,
  isAllowedImageType,
  isS3Configured,
  MAX_IMAGE_BYTES,
} from "@/lib/s3";
import { detectLabelText, isVisionConfigured } from "@/lib/vision";
import { parseWineLabel, type ParsedWineLabel } from "@/lib/label-parser";
import { logger } from "@/lib/logger";

export type ScanUploadUrlResult =
  | { ok: true; uploadUrl: string; key: string }
  | { ok: false; error: string };

export type ScanWineLabelResult =
  | {
      ok: true;
      data: ParsedWineLabel & { rawText: string; imageKey: string };
    }
  | { ok: false; error: string };

/**
 * Presign a PUT URL the browser can use to upload a label photo. The wine
 * row doesn't exist yet — the caller will create it after scanning, with
 * the returned key threaded through as the new wine's `imageKey`.
 */
export async function requestScanUploadUrl(
  contentType: string,
  contentLength: number,
): Promise<ScanUploadUrlResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  if (!isS3Configured()) {
    return { ok: false, error: "Image upload is not configured on this server" };
  }
  if (!isAllowedImageType(contentType)) {
    return { ok: false, error: "Unsupported image type. Use JPEG, PNG, or WebP." };
  }
  if (
    !Number.isInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_IMAGE_BYTES
  ) {
    return { ok: false, error: "Image must be 5MB or smaller." };
  }

  const ip = clientIp(await headers());
  const limit = await checkRateLimit(
    `scan-upload:${session.user.id}:${ip}`,
    { limit: 10, windowMs: 60_000 },
  );
  if (!limit.allowed) return { ok: false, error: "Too many requests" };

  const ext = extensionForType(contentType);
  const key = `wines/${session.user.id}/scans/${randomUUID()}.${ext}`;
  const uploadUrl = await getUploadUrl(key, contentType, contentLength);
  if (!uploadUrl) {
    return { ok: false, error: "Image upload is not configured on this server" };
  }

  return { ok: true, uploadUrl, key };
}

/**
 * Scan a previously uploaded label photo. Returns parsed fields ready to
 * pre-fill the add-wine form. The same `imageKey` is echoed back so the
 * client can persist it on the new wine row at submit time — no second
 * upload, exactly one S3 object per scanned wine.
 */
export async function scanWineLabel(key: string): Promise<ScanWineLabelResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  if (!isVisionConfigured()) {
    return { ok: false, error: "Label scanning is not configured on this server" };
  }

  if (typeof key !== "string" || key.length === 0 || key.length > 512) {
    return { ok: false, error: "Invalid object key" };
  }
  // Same defense as setWineImage — never trust a client-supplied key.
  const expectedPrefix = `wines/${session.user.id}/scans/`;
  if (!key.startsWith(expectedPrefix)) {
    return { ok: false, error: "Invalid object key" };
  }

  const ip = clientIp(await headers());
  const limit = await checkRateLimit(
    `scan-label:${session.user.id}:${ip}`,
    { limit: 10, windowMs: 60_000 },
  );
  if (!limit.allowed) return { ok: false, error: "Too many requests" };

  const publicUrl = getPublicUrl(key);
  if (!publicUrl) {
    return { ok: false, error: "Image not reachable" };
  }

  const rawText = await detectLabelText(publicUrl);
  if (!rawText) {
    logger.info("[scan] no text detected", { userId: session.user.id });
    return { ok: false, error: "Could not read label — enter manually" };
  }

  const parsed = parseWineLabel(rawText);
  return {
    ok: true,
    data: { ...parsed, rawText, imageKey: key },
  };
}
