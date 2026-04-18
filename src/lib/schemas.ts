/**
 * Shared Zod schemas for API route input validation.
 *
 * Every external input — path params, query strings, JSON bodies, FormData —
 * goes through one of these. Centralizing them keeps validation consistent
 * across routes and gives us one place to tighten when we discover edge cases.
 *
 * Two helper functions wrap the parse step so callers can return a typed 400
 * response on failure without writing the same try/catch everywhere.
 */

import { NextResponse } from "next/server";
import { z, ZodError, type ZodTypeAny, type ZodTypeDef, type ZodType } from "zod";

// ── Primitives ────────────────────────────────────────────────────────────

export const UuidSchema = z.string().uuid("Invalid id");

export const PriceSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(100_000_000, "Price exceeds maximum");

export const VintageSchema = z
  .number()
  .int()
  .min(1800)
  .max(new Date().getFullYear() + 1);

// Tighter than the previous "anything with an @ and a dot" — caps local part
// at 64 chars and total at 254 per RFC 5321, requires a TLD with at least
// two characters, rejects whitespace.
export const EmailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .regex(/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/, "Invalid email format")
  .transform((s) => s.toLowerCase());

export const PasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200, "Password too long")
  .refine((p) => /[a-z]/.test(p), "Password must include a lowercase letter")
  .refine((p) => /[A-Z]/.test(p), "Password must include an uppercase letter")
  .refine((p) => /\d/.test(p), "Password must include a number")
  .refine(
    (p) => /[^A-Za-z0-9]/.test(p),
    "Password must include a symbol (e.g. !@#$%)",
  );

// Sensible upper bound for date inputs — anything beyond +1 year from now is
// almost certainly a typo or an attack.
export const DateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .pipe(z.coerce.date())
  .refine((d) => {
    const max = new Date();
    max.setFullYear(max.getFullYear() + 1);
    return d.getTime() <= max.getTime() && d.getFullYear() >= 1900;
  }, "Date out of range");

// ── Domain schemas ────────────────────────────────────────────────────────

export const SignupBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: EmailSchema,
  password: PasswordSchema,
  csrfToken: z.string().min(1),
});

export const CreateWineBodySchema = z.object({
  name: z.string().trim().min(1).max(500),
  vintage: z.coerce.number().pipe(VintageSchema),
  region: z.string().trim().min(1).max(200),
  varietal: z.string().trim().min(1).max(200),
  producer: z.string().trim().min(1).max(200),
  purchasePrice: z.coerce.number().pipe(PriceSchema),
  // Optional S3 key for a pre-uploaded photo (e.g. label scan, feature #24).
  // Format is enforced at the call site against the caller's member prefix.
  imageKey: z
    .preprocess(
      (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
      z.string().max(512).optional(),
    )
    .optional(),
});

export const ValuationBodySchema = z.object({
  price: z.coerce.number().pipe(PriceSchema),
  source: z
    .enum(["manual", "liv-ex", "wine-searcher", "auction"])
    .optional(),
  date: z.string().optional(),
});

export const SensorHistoryQuerySchema = z.object({
  lockerId: UuidSchema,
  range: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("24h"),
});

export const AlertsQuerySchema = z.object({
  resolved: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});

// Sentinel device payload (feature #21). Ranges are physically plausible
// bounds for a wine-vault sensor — a value outside these is a malformed
// packet, not a real reading, so we 400 at the boundary instead of letting
// `checkThresholds` fire a critical alert + SES email on garbage. The db
// columns are Decimal(5,2) / Decimal(5,3); the upper bounds here all fit
// in 5 digits of precision (50.000 mm/s vibration, 120.00 °F).
export const SensorIngestBodySchema = z.object({
  lockerId: UuidSchema,
  temperature: z.coerce.number().finite().min(32).max(120),
  humidity: z.coerce.number().finite().min(0).max(100),
  vibration: z.coerce.number().finite().min(0).max(50),
  lightLux: z.coerce.number().finite().min(0).max(50_000),
  timestamp: z
    .string()
    .datetime({ offset: true })
    .pipe(z.coerce.date()),
  deviceSignature: z.string().min(1).max(512),
});

// ── Advisor tool params (feature #50) ─────────────────────────────────────

export const AdvisorWineIdParamSchema = z.object({
  wineId: UuidSchema,
});

export const AdvisorBenchmarkParamSchema = z.object({
  since: DateSchema.optional(),
});

// Chat route body. 8000 chars per turn is roughly ~2000 tokens — enough
// for a long question without letting a single message balloon the
// prompt. 40 turns caps total transcript cost per request; the chat UI
// should trim before sending when it exceeds that.
export const AdvisorChatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
});

// ── Delivery (feature #51) ─────────────────────────────────────────────────

export const DeliveryAddressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z
    .preprocess(
      (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
      z.string().trim().max(200).optional(),
    )
    .optional(),
  city: z.string().trim().min(1).max(100),
  // US two-letter code for demo. Non-US addresses arrive post-demo with an
  // explicit country field and a relaxed state/region schema.
  state: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/),
  postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code"),
});

export const CreateDeliveryRequestBodySchema = z.object({
  wineIds: z.array(UuidSchema).min(1).max(20),
  address: DeliveryAddressSchema,
});

export const ConfirmPinBodySchema = z.object({
  deliveryRequestId: UuidSchema,
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export const ConfirmOtpBodySchema = z.object({
  deliveryRequestId: UuidSchema,
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export const ConfirmAddressBodySchema = z.object({
  deliveryRequestId: UuidSchema,
  address: DeliveryAddressSchema,
});

export const RecordHandoffBodySchema = z.object({
  deliveryRequestId: UuidSchema,
  scannedRecipientName: z.string().trim().min(1).max(200),
  photoKey: z.string().trim().min(1).max(512),
});

export const CreateAuthorizedRecipientBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  relationship: z
    .preprocess(
      (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
      z.string().trim().max(100).optional(),
    )
    .optional(),
});

export const DeliveryRequestIdParamSchema = z.object({
  deliveryRequestId: UuidSchema,
});

// Door-side (driver) routes — Step 3. Input is the name + DOB read off
// the recipient's ID. Server matches name case-insensitively against the
// AuthorizedRecipient registry for the member, cross-checks DOB exactly
// against the registered value, and enforces the Florida DABT >= 21
// age floor before advancing handoff_started → id_scanned.
export const IdScanBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD")
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
    }, "dateOfBirth is not a valid calendar date"),
});

export const DriverUploadUrlBodySchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  // Hardcoded 5MB cap — mirrors MAX_IMAGE_BYTES in src/lib/s3.ts without an
  // import cycle.
  contentLength: z.number().int().positive().max(5 * 1024 * 1024),
});

export const DriverCompleteBodySchema = z.object({
  photoKey: z.string().trim().min(1).max(512),
});

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse and return a typed result. On failure, returns a NextResponse with a
 * 400 status and a single generic error string. We deliberately do NOT echo
 * Zod's per-field issues to clients — they would help debug a real client but
 * also help an attacker map the validation graph. Server logs still see the
 * full error via the logger.
 */
// We accept any ZodType (not just ZodSchema<T>) so callers can pass
// schemas with transforms / preprocess steps where the input and output
// types differ — e.g. FormData parsing where strings get coerced into
// numbers and dates.
export function parseOr400<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
):
  | { ok: true; data: z.infer<S> }
  | { ok: false; response: NextResponse } {
  try {
    const parsed = schema.parse(data);
    return { ok: true, data: parsed };
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message ?? "Invalid input"
        : "Invalid input";
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: 400 }),
    };
  }
}

/** Parse a path param. Same shape, returns 404 instead of 400 for bad UUIDs
 *  to avoid leaking that the route exists. */
export function parsePathParamOr404<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  data: unknown,
):
  | { ok: true; data: T }
  | { ok: false; response: NextResponse } {
  try {
    return { ok: true, data: schema.parse(data) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
}
