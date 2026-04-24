"use server";

import { z } from "zod";
import { InsuranceReferralStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { INSURANCE_PARTNERS } from "@/lib/insurance";
import { UuidSchema } from "@/lib/schemas";

export interface InsuranceReferralRequestState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  referralId: string | null;
  shareToken: string | null;
}

export const INITIAL_INSURANCE_REFERRAL_REQUEST_STATE: InsuranceReferralRequestState =
  {
    submittedAt: null,
    ok: false,
    error: null,
    referralId: null,
    shareToken: null,
  };

function isInsurancePartnerProgramConfigured(): boolean {
  if (!env.INSURANCE_PARTNER_ENABLED) return false;
  if (env.INSURANCE_API_SECRET) return true;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

function optionalString(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

const SubmitSchema = z.object({
  partnerName: z
    .string()
    .trim()
    .min(1, "Select a carrier partner")
    .refine(
      (name) => INSURANCE_PARTNERS.some((p) => p.name === name),
      "Select a carrier partner",
    ),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email("Enter a valid email").max(200).optional(),
  contactPhone: z.string().trim().max(60).optional(),
  policyNumber: z.string().trim().max(120).optional(),
  memberNote: z.string().trim().max(1000).optional(),
});

const OPEN_STATUSES: InsuranceReferralStatus[] = [
  InsuranceReferralStatus.submitted,
  InsuranceReferralStatus.in_review,
  InsuranceReferralStatus.introduced,
];

export async function submitInsuranceReferral(
  _prev: InsuranceReferralRequestState,
  formData: FormData,
): Promise<InsuranceReferralRequestState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in to request an insurance referral.",
        referralId: null,
        shareToken: null,
      };
    }

    if (!isInsurancePartnerProgramConfigured()) {
      return {
        submittedAt: now,
        ok: false,
        error:
          "Insurance partner program is not configured in this environment.",
        referralId: null,
        shareToken: null,
      };
    }

    const parsed = SubmitSchema.safeParse({
      partnerName: formData.get("partnerName"),
      contactName: optionalString(formData.get("contactName"), 200),
      contactEmail: optionalString(formData.get("contactEmail"), 200),
      contactPhone: optionalString(formData.get("contactPhone"), 60),
      policyNumber: optionalString(formData.get("policyNumber"), 120),
      memberNote: optionalString(formData.get("memberNote"), 1000),
    });
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        referralId: null,
        shareToken: null,
      };
    }

    const existing = await prisma.insuranceReferral.findFirst({
      where: { memberId, status: { in: OPEN_STATUSES } },
      select: { id: true, partnerName: true, status: true },
    });
    if (existing) {
      return {
        submittedAt: now,
        ok: false,
        error: `You already have an active referral request (${existing.partnerName} · ${existing.status.replace(
          /_/g,
          " ",
        )}). Cancel it to start a new one.`,
        referralId: null,
        shareToken: null,
      };
    }

    const createData: Prisma.InsuranceReferralCreateInput = {
      member: { connect: { id: memberId } },
      partnerName: parsed.data.partnerName,
      contactName: parsed.data.contactName ?? null,
      contactEmail: parsed.data.contactEmail ?? null,
      contactPhone: parsed.data.contactPhone ?? null,
      policyNumber: parsed.data.policyNumber ?? null,
      memberNote: parsed.data.memberNote ?? null,
    };

    const created = await prisma.insuranceReferral.create({
      data: createData,
      select: { id: true, shareToken: true, partnerName: true },
    });

    logger.info("[insurance] referral submitted", {
      memberId,
      insuranceReferralId: created.id,
      partnerName: created.partnerName,
    });

    revalidatePath("/settings");
    revalidatePath("/settings/insurance");
    revalidatePath("/admin/insurance");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      referralId: created.id,
      shareToken: created.shareToken,
    };
  } catch (err) {
    logger.error("[insurance] referral submit failed", err, {
      action: "submitInsuranceReferral",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Unable to submit referral. Please try again.",
      referralId: null,
      shareToken: null,
    };
  }
}

export async function cancelInsuranceReferral(
  referralId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) return { ok: false, error: "unauthenticated" };

    const parsed = UuidSchema.safeParse(referralId);
    if (!parsed.success) return { ok: false, error: "invalid_id" };

    const existing = await prisma.insuranceReferral.findFirst({
      where: { id: parsed.data, memberId },
      select: { id: true, status: true },
    });
    if (!existing) return { ok: false, error: "not_found" };

    if (!OPEN_STATUSES.includes(existing.status)) {
      return { ok: false, error: "not_cancellable" };
    }

    await prisma.insuranceReferral.update({
      where: { id: existing.id },
      data: {
        status: InsuranceReferralStatus.cancelled,
        cancelledAt: new Date(),
      },
    });

    revalidatePath("/settings");
    revalidatePath("/settings/insurance");
    revalidatePath("/admin/insurance");

    return { ok: true };
  } catch (err) {
    logger.error("[insurance] referral cancel failed", err, {
      action: "cancelInsuranceReferral",
    });
    return { ok: false, error: "unknown_error" };
  }
}

