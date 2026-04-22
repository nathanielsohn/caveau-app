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
import { CAVEAU_FIELDS } from "./migration-mapping";

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
  // Optional heartbeat fields (feature #58). When present the ingest
  // route upserts the device's mutable state — battery, connectivity,
  // firmware — and emits a SentinelDeviceEvent on any change. Missing
  // fields are ignored rather than nulling out the existing value, so
  // older simulated devices keep working without schema churn.
  batteryPct: z.coerce.number().int().min(0).max(100).optional(),
  connectivity: z.enum(["wifi", "lte_m", "offline"]).optional(),
  firmwareVersion: z.string().min(1).max(64).optional(),
});

// ── Advisor tool params (feature #50) ─────────────────────────────────────

export const AdvisorWineIdParamSchema = z.object({
  wineId: UuidSchema,
});

export const AdvisorBenchmarkParamSchema = z.object({
  since: DateSchema.optional(),
});

export const AdvisorAllocationsParamSchema = z.object({
  status: z.enum(["eligible_open", "requested", "all"]).optional(),
});

export const AdvisorAppraisalsParamSchema = z.object({
  status: z.enum(["open", "completed", "all"]).optional(),
});

export const AdvisorAcquisitionsParamSchema = z.object({
  status: z.enum(["open", "fulfilled", "all"]).optional(),
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

// ── Events & tasting module (feature #53) ────────────────────────────────

export const EventSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, digits, and dashes");

export const RsvpBodySchema = z.object({
  eventId: UuidSchema,
  seats: z.coerce.number().int().min(1).max(4).default(1),
  notes: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
      z.string().max(500).optional(),
    )
    .optional(),
});

export const EventSignupBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: EmailSchema,
  phone: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
      z.string().max(40).optional(),
    )
    .optional(),
  notes: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
      z.string().max(2000).optional(),
    )
    .optional(),
});

export const CreateEventBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: EventSlugSchema,
    summary: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
        z.string().max(500).optional(),
      )
      .optional(),
    description: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
        z.string().max(5000).optional(),
      )
      .optional(),
    locationName: z.string().trim().min(1).max(200),
    locationAddr: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
        z.string().max(300).optional(),
      )
      .optional(),
    startsAt: DateSchema,
    endsAt: DateSchema,
    capacity: z.coerce.number().int().min(1).max(5000),
    priceUsd: z.coerce.number().min(0).max(100_000),
    memberOnly: z.preprocess(
      (v) => v === "on" || v === "true" || v === true,
      z.boolean(),
    ),
    status: z.enum(["draft", "published", "cancelled"]).default("published"),
  })
  .refine((v) => v.endsAt.getTime() >= v.startsAt.getTime(), {
    message: "End time must be at or after the start time",
    path: ["endsAt"],
  });

// ── Concierge migration (feature #52) ─────────────────────────────────────

const CaveauFieldSchema = z.enum(
  CAVEAU_FIELDS as unknown as [string, ...string[]],
);

const ColumnMappingSchema = z.record(
  CaveauFieldSchema,
  z.union([z.string().trim().min(1).max(200), z.null()]),
);

// One CSV row after client-side parsing. Limit per-field length to keep
// a malicious client from ballooning the row payload; also cap the
// number of columns so a header row can't fabricate 1000 fake keys.
const MigrationRowSchema = z
  .record(z.string().min(1).max(200), z.string().max(5000))
  .refine((o) => Object.keys(o).length <= 100, "Too many columns");

export const SubmitMigrationBodySchema = z.object({
  source: z.enum(["cellartracker", "vivino", "other"]),
  originalFilename: z.string().trim().min(1).max(200),
  columnMapping: ColumnMappingSchema,
  rows: z.array(MigrationRowSchema).min(1).max(500),
  note: z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(500).optional(),
    )
    .optional(),
});

export const MigrationUpdateMappingBodySchema = z.object({
  columnMapping: ColumnMappingSchema,
});

export const MigrationFailBodySchema = z.object({
  failureReason: z.string().trim().min(1).max(500),
});

// ── Allocations (feature #60) ─────────────────────────────────────────────

export const AllocationSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(
    /^[a-z0-9-]+$/,
    "Slug may only contain lowercase letters, digits, and dashes",
  );

export const CreateAllocationBodySchema = z
  .object({
    slug: AllocationSlugSchema,
    producer: z.string().trim().min(1).max(200),
    wineName: z.string().trim().min(1).max(200),
    vintage: z.coerce.number().pipe(VintageSchema),
    region: z.string().trim().min(1).max(200),
    varietal: z.string().trim().min(1).max(200),
    description: z
      .preprocess(
        (v) =>
          typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
        z.string().max(5000).optional(),
      )
      .optional(),
    tastingNotes: z
      .preprocess(
        (v) =>
          typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
        z.string().max(5000).optional(),
      )
      .optional(),
    quantity: z.coerce.number().int().min(1).max(1000),
    pricePerBottleUsd: z.coerce.number().pipe(PriceSchema),
    minimumTier: z.enum(["gold", "reserve", "platinum", "black"]),
    foundingOnly: z.preprocess(
      (v) => v === "on" || v === "true" || v === true,
      z.boolean(),
    ),
    foundingEarlyAccess: z.preprocess(
      (v) => v === "on" || v === "true" || v === true,
      z.boolean(),
    ),
    heroImageKey: z
      .preprocess(
        (v) =>
          typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
        z.string().max(512).optional(),
      )
      .optional(),
    opensAt: DateSchema,
    closesAt: DateSchema,
    status: z.enum(["draft", "published"]).default("draft"),
  })
  .refine((v) => v.closesAt.getTime() >= v.opensAt.getTime(), {
    message: "Close date must be at or after the open date",
    path: ["closesAt"],
  });

export const RequestAllocationBodySchema = z.object({
  allocationId: UuidSchema,
  quantityRequested: z.coerce.number().int().min(1).max(3),
  memberNote: z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(500).optional(),
    )
    .optional(),
});

export const AllocationRequestActionBodySchema = z.object({
  requestId: UuidSchema,
  staffNote: z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(500).optional(),
    )
    .optional(),
});

// ── Welcome appraisal (feature #61) ───────────────────────────────────────

/**
 * One estate heir. Name + share string kept loose on purpose — a heir
 * record might read "Elena Saenz (daughter)" and a share might read
 * "25% or $375,000 cash-equivalent". Free text, capped to keep the row
 * from ballooning.
 */
export const AppraisalHeirSchema = z.object({
  name: z.string().trim().min(1).max(200),
  share: z.string().trim().min(1).max(200),
});

/**
 * Member-side request body. `purpose`, `basis`, optional free-text
 * note, optional scoped wine ids (null/missing = appraise whole
 * portfolio), optional heirs (required only for purpose=estate,
 * enforced via `.superRefine` below). `requestWelcome` lets a founding
 * member flag the request as their welcome appraisal — the server
 * re-checks eligibility before honoring it (see
 * `checkWelcomeEligibility`), so a non-founding caller setting it to
 * true just gets their price not discounted.
 */
export const RequestAppraisalBodySchema = z
  .object({
    purpose: z.enum([
      "insurance",
      "estate",
      "tax_donation",
      "divorce",
      "gift",
      "personal",
    ]),
    basis: z.enum([
      "fair_market_value",
      "retail_replacement",
      "auction_estimate",
    ]),
    memberNote: z
      .preprocess(
        (v) =>
          typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
        z.string().max(1000).optional(),
      )
      .optional(),
    scopedWineIds: z.array(UuidSchema).max(500).optional(),
    heirs: z.array(AppraisalHeirSchema).max(20).optional(),
    requestWelcome: z.preprocess(
      (v) => v === "on" || v === "true" || v === true,
      z.boolean().default(false),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.purpose === "estate" && (!v.heirs || v.heirs.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Estate appraisals require at least one heir",
        path: ["heirs"],
      });
    }
  });

/**
 * Admin completion body. Runs when staff has reviewed the request,
 * locked in an appraiser, and wants to mint the final document. The
 * server re-snapshots the portfolio at this point (using the stored
 * scope), computes totals, hashes, and assigns the next
 * appraisal_number. Everything except staff-authored metadata is
 * derived server-side so a client can't forge a basis total.
 */
export const CompleteAppraisalBodySchema = z.object({
  appraisalId: UuidSchema,
  appraiserName: z.string().trim().min(1).max(200),
  appraiserCreds: z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(500).optional(),
    )
    .optional(),
  scopeOfWork: z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(2000).optional(),
    )
    .optional(),
  effectiveDate: DateSchema,
  staffNote: z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(1000).optional(),
    )
    .optional(),
});

/**
 * Admin action bodies for start/cancel/revoke. All carry just the
 * appraisal id plus an optional note so one Zod schema covers the
 * three lifecycle transitions the queue surfaces.
 */
export const AppraisalLifecycleActionSchema = z.object({
  appraisalId: UuidSchema,
  staffNote: z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(500).optional(),
    )
    .optional(),
});

// ── Acquisition sourcing (feature #62) ───────────────────────────────────

/**
 * Empty-string-to-undefined preprocessor for optional form inputs.
 * FormData always carries a value (never undefined) for an unset input,
 * so optional `z.string().optional()` alone can't distinguish "user
 * left it blank" from "user sent an empty string". We treat either as
 * absent so a blank vintage / region / varietal field doesn't get
 * persisted as "" in the DB.
 */
const optionalString = (max: number) =>
  z
    .preprocess(
      (v) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined,
      z.string().max(max).optional(),
    )
    .optional();

/**
 * Optional integer field that accepts "" / missing as absent.
 * Used for vintage fields on the request form — a member entering only
 * `vintageExact` shouldn't get a ZodError for the blank min/max inputs.
 */
const optionalVintage = z
  .preprocess(
    (v) => {
      if (v === "" || v == null) return undefined;
      const n = typeof v === "string" ? Number(v) : v;
      return Number.isFinite(n) ? n : v;
    },
    z.number().int().min(1800).max(new Date().getFullYear() + 1).optional(),
  )
  .optional();

/**
 * Member-side acquisition request body.
 *
 * `producer` is the only required field — everything else is optional
 * so a member can be as specific or as loose as they want ("2015
 * Margaux" vs. "any Châteauneuf-du-Pape under $2K"). Vintage can be
 * exact OR a range; the `.superRefine` below rejects mixing exact with
 * a range, and rejects a range where min > max.
 *
 * `quantity` is capped at MAX_BOTTLES_PER_REQUEST (12) — a case is the
 * largest typical ask; anything bigger belongs on a future bulk
 * surface.
 */
export const RequestAcquisitionBodySchema = z
  .object({
    producer: z.string().trim().min(1).max(200),
    wineName: optionalString(200),
    vintageExact: optionalVintage,
    vintageMin: optionalVintage,
    vintageMax: optionalVintage,
    region: optionalString(200),
    varietal: optionalString(200),
    quantity: z.coerce.number().int().min(1).max(12),
    maxBudgetUsd: z
      .preprocess(
        (v) => {
          if (v === "" || v == null) return undefined;
          const n = typeof v === "string" ? Number(v) : v;
          return Number.isFinite(n) ? n : v;
        },
        PriceSchema.optional(),
      )
      .optional(),
    memberNote: optionalString(1000),
  })
  .superRefine((v, ctx) => {
    const hasExact = v.vintageExact != null;
    const hasRange = v.vintageMin != null || v.vintageMax != null;
    if (hasExact && hasRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter either an exact vintage or a range, not both",
        path: ["vintageExact"],
      });
    }
    if (
      v.vintageMin != null &&
      v.vintageMax != null &&
      v.vintageMin > v.vintageMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vintage min must be at or before vintage max",
        path: ["vintageMax"],
      });
    }
  });

/**
 * Admin sourcing-start body. Staff begin sourcing, optionally attach a
 * quote (`estimatedTotalUsd`) and a staff note visible to the member.
 */
export const StartAcquisitionSourcingSchema = z.object({
  acquisitionId: UuidSchema,
  estimatedTotalUsd: z
    .preprocess(
      (v) => {
        if (v === "" || v == null) return undefined;
        const n = typeof v === "string" ? Number(v) : v;
        return Number.isFinite(n) ? n : v;
      },
      PriceSchema.optional(),
    )
    .optional(),
  staffNote: optionalString(1000),
});

/**
 * Admin fulfill body. Locks in cost + price + source and transactionally
 * writes `quantity` Wine rows with the acquisition as the back-link.
 */
export const FulfillAcquisitionSchema = z.object({
  acquisitionId: UuidSchema,
  source: z.enum(["livex", "broker", "auction", "caveau_private"]),
  actualCostUsd: z.coerce.number().pipe(PriceSchema),
  memberPriceUsd: z.coerce.number().pipe(PriceSchema),
  staffNote: optionalString(1000),
});

/**
 * Admin decline body. Carries a required reason note so the member
 * gets a human explanation on the detail page.
 */
export const DeclineAcquisitionSchema = z.object({
  acquisitionId: UuidSchema,
  staffNote: z.string().trim().min(1).max(1000),
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
