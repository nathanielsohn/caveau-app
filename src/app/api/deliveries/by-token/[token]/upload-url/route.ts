/**
 * POST /api/deliveries/by-token/[token]/upload-url (feature #51)
 *
 * Driver-side. Requests a presigned PUT URL for the handoff photo. The
 * final key lives at `deliveries/{deliveryId}/{uploadId}.{ext}` and is
 * whitelisted in src/lib/s3.ts so a caller can't smuggle a key shape
 * outside this prefix.
 *
 * Returns 503 when S3 isn't configured (`AWS_S3_BUCKET` unset) — the
 * client surfaces a "photo upload disabled" fallback instead of a
 * cryptic error.
 */
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  DriverUploadUrlBodySchema,
  parseOr400,
} from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  DRIVER_TOKEN_PATTERN,
  loadDeliveryByDriverToken,
} from "@/lib/delivery";
import { extensionForType, getUploadUrl } from "@/lib/s3";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!DRIVER_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bundle = await loadDeliveryByDriverToken(token);
  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { delivery } = bundle;

  const rate = await checkRateLimit(`deliver-upload:${delivery.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const now = Date.now();
  const terminal =
    delivery.status === "completed" ||
    delivery.status === "cancelled" ||
    delivery.status === "expired";

  if (delivery.expiresAt.getTime() < now && !terminal) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }
  if (terminal) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }
  if (delivery.status !== "id_scanned") {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(DriverUploadUrlBodySchema, body);
  if (!parsed.ok) return parsed.response;
  const { contentType, contentLength } = parsed.data;

  const key = `deliveries/${delivery.id}/${randomUUID()}.${extensionForType(contentType)}`;

  try {
    const uploadUrl = await getUploadUrl(key, contentType, contentLength);
    if (!uploadUrl) {
      return NextResponse.json(
        { error: "upload_not_configured" },
        { status: 503 },
      );
    }
    return NextResponse.json({ uploadUrl, key });
  } catch (err) {
    logger.error("[api/deliveries/by-token/upload-url] failed", err, {
      deliveryId: delivery.id,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
