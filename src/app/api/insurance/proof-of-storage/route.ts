import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { estimateInsuranceSavings } from "@/lib/insurance";
import { tierSpecForDbTier } from "@/lib/tiers";
import { toNumber } from "@/lib/utils";
import { UuidSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

function notConfigured(): NextResponse {
  return NextResponse.json({ error: "not_configured" }, { status: 503 });
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function isConfigured(): boolean {
  if (!env.INSURANCE_PARTNER_ENABLED) return false;
  if (env.INSURANCE_API_SECRET) return true;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

function authorized(req: NextRequest): boolean {
  const expected = env.INSURANCE_API_SECRET;
  if (!expected) {
    // Dev/test can hit the endpoint without a secret; everything else
    // must configure one.
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
  }
  const header = req.headers.get("authorization") ?? "";
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expectedHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isConfigured()) return notConfigured();
  if (!authorized(req)) return unauthorized();

  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token") ?? "";
  const token = UuidSchema.safeParse(rawToken);
  if (!token.success) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const referral = await prisma.insuranceReferral.findUnique({
    where: { shareToken: token.data },
    select: {
      id: true,
      partnerName: true,
      status: true,
      createdAt: true,
      introducedAt: true,
      boundAt: true,
      declinedAt: true,
      cancelledAt: true,
      member: {
        select: {
          id: true,
          name: true,
          email: true,
          tier: true,
        },
      },
    },
  });
  if (!referral || referral.status === "cancelled") {
    // 404 keeps tokens non-enumerable even to a caller who has the Bearer
    // secret but not a valid token.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const tierSpec = tierSpecForDbTier(referral.member.tier);

  const [portfolio, lockers, certificates] = await Promise.all([
    prisma.wine.aggregate({
      where: { memberId: referral.member.id, status: "in_cellar" },
      _count: { _all: true },
      _sum: { currentValue: true },
    }),
    prisma.locker.findMany({
      where: { memberId: referral.member.id },
      orderBy: [{ facilityId: "asc" }, { lockerNumber: "asc" }],
      select: {
        id: true,
        lockerNumber: true,
        zone: true,
        facility: {
          select: { id: true, name: true, location: true, elevationFt: true },
        },
      },
    }),
    prisma.provenanceCertificate.findMany({
      where: { wine: { memberId: referral.member.id }, revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        certificateNumber: true,
        createdAt: true,
        wine: { select: { id: true, name: true, producer: true, vintage: true } },
      },
    }),
  ]);

  const collectionValueUsd = portfolio._sum.currentValue
    ? toNumber(portfolio._sum.currentValue)
    : 0;
  const estimate = estimateInsuranceSavings({
    collectionValueUsd,
    tier: tierSpec.slug,
  });

  return NextResponse.json(
    {
      schema: "caveau.insurance.proof_of_storage.v1",
      generatedAt: new Date().toISOString(),
      referral: {
        partnerName: referral.partnerName,
        status: referral.status,
        submittedAt: referral.createdAt.toISOString(),
        introducedAt: referral.introducedAt?.toISOString() ?? null,
        boundAt: referral.boundAt?.toISOString() ?? null,
        declinedAt: referral.declinedAt?.toISOString() ?? null,
        cancelledAt: referral.cancelledAt?.toISOString() ?? null,
        token: token.data,
      },
      member: {
        name: referral.member.name,
        email: referral.member.email,
        tier: tierSpec.name,
      },
      storage: {
        bottleCount: portfolio._count._all,
        collectionValueUsd,
        lockers: lockers.map((l) => ({
          id: l.id,
          lockerNumber: l.lockerNumber,
          zone: l.zone,
          facility: l.facility,
        })),
      },
      underwriting: {
        estimatedSavings: {
          savingsLowUsd: estimate.savingsLowUsd,
          savingsHighUsd: estimate.savingsHighUsd,
          discountPctLow: estimate.discountPctLow,
          discountPctHigh: estimate.discountPctHigh,
          baselinePremiumLowUsd: estimate.baselinePremiumLowUsd,
          baselinePremiumHighUsd: estimate.baselinePremiumHighUsd,
        },
        disciplineBullets: estimate.disciplineBullets,
      },
      reports: {
        provenanceBundleSchema: "caveau.provenance.v1",
        certificates: certificates.map((c) => ({
          id: c.id,
          certificateNumber: c.certificateNumber,
          issuedAt: c.createdAt.toISOString(),
          bottle: {
            id: c.wine.id,
            name: c.wine.name,
            producer: c.wine.producer,
            vintage: c.wine.vintage,
          },
          exports: {
            json: `/api/insurance/reports/certificates/${c.id}/provenance?format=json&token=${token.data}`,
            pdf: `/api/insurance/reports/certificates/${c.id}/provenance?format=pdf&token=${token.data}`,
          },
        })),
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

