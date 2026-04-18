/**
 * AWS S3 client for wine image uploads (feature #18).
 *
 * Two environment variables drive the upload flow:
 *   - AWS_REGION             e.g. "us-east-1"
 *   - AWS_S3_BUCKET          the bucket that holds member wine photos
 *
 * One optional variable swaps the public read URL to a CDN:
 *   - AWS_CLOUDFRONT_DOMAIN  e.g. "d111111abcdef8.cloudfront.net"
 *
 * If `AWS_S3_BUCKET` is not set, `getUploadUrl` returns `null` and logs a
 * warning so local dev keeps working without AWS credentials. The upload
 * UI surfaces a friendly error in that case instead of crashing.
 *
 * The S3 client is lazily instantiated so importing this module from code
 * paths that never sign a URL (e.g. a build step) does not touch AWS config.
 *
 * Mirrors the SES wrapper in `./email.ts` — same lazy-init + no-op fallback
 * pattern, kept identical so a future maintainer only has to learn it once.
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

/** Whitelisted upload mime types. Server enforces this before signing. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Five-megabyte cap. Mirrored client-side in the upload form. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Presigned URL TTL — long enough for a slow phone upload, short enough
 *  that a leaked URL goes stale before it can be abused. Operator-tunable
 *  via S3_UPLOAD_URL_TTL_SECONDS (clamped to [60, 900] in env.ts). */
const UPLOAD_URL_TTL_SECONDS = env.S3_UPLOAD_URL_TTL_SECONDS;

let cachedClient: S3Client | null = null;
function getClient(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({ region: env.AWS_REGION ?? "us-east-1" });
  }
  return cachedClient;
}

/** Type guard for the mime whitelist. */
export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

/** Map a whitelisted mime type to a safe file extension. */
export function extensionForType(type: AllowedImageType): "jpg" | "png" | "webp" {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return "webp";
}

/**
 * Generate a presigned PUT URL for a direct browser → S3 upload.
 * Returns `null` when S3 isn't configured so callers can show a friendly
 * "image upload disabled" message instead of crashing in local dev.
 */
export async function getUploadUrl(
  key: string,
  contentType: AllowedImageType,
  contentLength: number,
): Promise<string | null> {
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    console.warn(
      `[s3] AWS_S3_BUCKET unset — skipping upload URL for key ${key}`,
    );
    return null;
  }
  if (!isValidUploadKey(key)) {
    console.warn(`[s3] rejecting upload URL — key does not match an accepted shape: ${key}`);
    return null;
  }
  if (
    !Number.isInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_IMAGE_BYTES
  ) {
    console.warn(
      `[s3] rejecting upload URL — invalid contentLength ${contentLength} for key ${key}`,
    );
    return null;
  }

  try {
    const client = getClient();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return await getSignedUrl(client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
  } catch (err) {
    console.error("[s3] getUploadUrl failed:", err);
    return null;
  }
}

/**
 * Resolve an S3 object key to its public read URL. Prefers the CloudFront
 * domain when configured, otherwise falls back to the regional S3 endpoint.
 * Returns `null` when neither is set, so render code can fall through to
 * the placeholder bottle silhouette.
 */
export function getPublicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const cdn = env.AWS_CLOUDFRONT_DOMAIN;
  if (cdn) return `https://${cdn}/${key}`;
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) return null;
  const region = env.AWS_REGION ?? "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Best-effort delete of a wine photo. Called when a wine leaves the
 * collection (disposition flow, feature #34) so we don't leak storage.
 * Returns true on success, false on any failure — never throws so callers
 * don't have to wrap in try/catch.
 */
export async function deleteObject(key: string | null | undefined): Promise<boolean> {
  if (!key) return false;
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) return false;
  try {
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    console.error("[s3] deleteObject failed:", err);
    return false;
  }
}

/** True when the upload pipeline is fully configured. */
export function isS3Configured(): boolean {
  return Boolean(env.AWS_S3_BUCKET);
}

/**
 * Accepted key shapes. Every caller in this repo builds its key as one of
 * these three forms; hard-coding the pattern here lets `getUploadUrl`
 * reject anything else before we hand it to the AWS SDK. Belt-and-braces
 * against a future caller accidentally (or maliciously) passing a
 * traversal-prone key like `wines/../../other-member/file.jpg` — S3
 * happily accepts such strings as object names and would pollute the
 * bucket namespace.
 */
const KEY_PATTERNS: RegExp[] = [
  // Wine image uploads: wines/{memberId}/{wineId}/{uploadId}.{ext}
  /^wines\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/,
  // Label OCR scans: wines/{memberId}/scans/{uploadId}.{ext}
  /^wines\/[0-9a-f-]{36}\/scans\/[0-9a-f-]{36}\.(jpg|png|webp)$/,
  // NFC intake photos: nfc-intake/{memberId}/{wineId}/{uploadId}.{ext}
  /^nfc-intake\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/,
];

export function isValidUploadKey(key: string): boolean {
  if (key.includes("..") || key.includes("\0")) return false;
  return KEY_PATTERNS.some((re) => re.test(key));
}
