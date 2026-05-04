/**
 * Google Cloud Vision wrapper for wine label OCR (feature #24).
 *
 * Thin REST client — no @google-cloud/vision SDK, no service-account JSON. A
 * single POST to `/v1/images:annotate?key=<API_KEY>` with a TEXT_DETECTION
 * feature is enough and keeps the bundle lean.
 *
 * Gracefully no-ops when `GOOGLE_CLOUD_VISION_API_KEY` is unset: callers see
 * `null` back and the UI falls through to manual entry. Mirrors the
 * "optional env var, feature degrades" pattern used by `./s3.ts` and
 * `./email.ts`.
 *
 * The API key must be restricted to Vision API only in Google Cloud Console;
 * we can't enforce that from app code, but it's documented in docs/GETTING_STARTED.md.
 */
import { env } from "./env";
import { logger } from "./logger";

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/** True when Vision is configured. Must be called server-side — reads env. */
export function isVisionConfigured(): boolean {
  return Boolean(env.GOOGLE_CLOUD_VISION_API_KEY);
}

interface AnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }>;
}

/**
 * Run OCR on a publicly readable image URL. Returns the full annotated text
 * (newlines preserved so the label parser can work line-by-line), or `null`
 * when Vision is unconfigured, the call fails, or no text is detected.
 *
 * `imageUrl` must be reachable by Google's servers, which is why we pass the
 * CloudFront/S3 public URL rather than the private object key.
 */
export async function detectLabelText(imageUrl: string): Promise<string | null> {
  const apiKey = env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { source: { imageUri: imageUrl } },
            features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.warn("[vision] annotate HTTP error", { status: res.status });
      return null;
    }

    const data = (await res.json()) as AnnotateResponse;
    const first = data.responses?.[0];
    if (first?.error?.message) {
      logger.warn("[vision] annotate returned error", {
        error: first.error.message,
      });
      return null;
    }

    const text = first?.fullTextAnnotation?.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (err) {
    logger.error("[vision] detectLabelText failed", err);
    return null;
  }
}
