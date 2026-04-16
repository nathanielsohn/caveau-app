"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { EmailSchema } from "@/lib/schemas";

export interface WaitlistSubmitState {
  /** Bumped on every submit so the client can detect a fresh result even
   *  when the user retries the same payload. Mirrors settings pattern. */
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  confirmedName: string | null;
}

export const INITIAL_WAITLIST_STATE: WaitlistSubmitState = {
  submittedAt: null,
  ok: false,
  error: null,
  confirmedName: null,
};

// Allowed sources correspond to discrete marketing activations. Free-form
// text would be convenient but invites junk from automated form fills, so
// we whitelist and ignore anything else.
const ALLOWED_SOURCES = [
  "website",
  "naples-wine-festival",
  "referral",
  "press",
  "other",
] as const;

const SubmitSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: EmailSchema,
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  source: z
    .string()
    .trim()
    .optional()
    .transform((v) =>
      v && (ALLOWED_SOURCES as readonly string[]).includes(v) ? v : undefined,
    ),
  referredBy: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export async function submitWaitlist(
  _prev: WaitlistSubmitState,
  formData: FormData,
): Promise<WaitlistSubmitState> {
  const now = Date.now();
  try {
    const raw = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone") ?? undefined,
      source: formData.get("source") ?? undefined,
      referredBy: formData.get("referredBy") ?? undefined,
      notes: formData.get("notes") ?? undefined,
    };

    const parsed = SubmitSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        confirmedName: null,
      };
    }

    const data = parsed.data;

    try {
      await prisma.waitlist.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          source: data.source,
          referredBy: data.referredBy,
          notes: data.notes,
        },
      });
    } catch (e) {
      // Unique violation on email — treat as success to prevent enumeration
      // and to give a clean UX on accidental double-submits.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return {
          submittedAt: now,
          ok: true,
          error: null,
          confirmedName: data.name,
        };
      }
      throw e;
    }

    return {
      submittedAt: now,
      ok: true,
      error: null,
      confirmedName: data.name,
    };
  } catch (e) {
    logger.error("submitWaitlist failed", e, { action: "submitWaitlist" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not submit. Please try again in a moment.",
      confirmedName: null,
    };
  }
}
