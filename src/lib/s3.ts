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
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
 *  that a leaked URL goes stale before it can be abused. */
const UPLOAD_URL_TTL_SECONDS = 5 * 60;

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
): Promise<string | null> {
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    console.warn(
      `[s3] AWS_S3_BUCKET unset — skipping upload URL for key ${key}`,
    );
    return null;
  }

  try {
    const client = getClient();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
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

/** True when the upload pipeline is fully configured. */
export function isS3Configured(): boolean {
  return Boolean(env.AWS_S3_BUCKET);
}
