import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileMember } from "@/lib/mobile-auth";
import { getPublicUrl } from "@/lib/s3";
import { UuidSchema, parsePathParamOr404 } from "@/lib/schemas";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parsePathParamOr404(UuidSchema, rawId);
  if (!idResult.ok) return idResult.response;

  const wine = await prisma.wine.findFirst({
    where: { id: idResult.data, memberId: auth.member.id },
    include: {
      lockerSlots: {
        orderBy: { slotPosition: "asc" },
        include: {
          locker: {
            select: { id: true, lockerNumber: true, zone: true, facilityId: true },
          },
        },
      },
      valuations: {
        orderBy: { date: "desc" },
        take: 25,
      },
      certificates: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          certificateNumber: true,
          dataIntegrityHash: true,
          monitoringStart: true,
          monitoringEnd: true,
        },
      },
    },
  });

  if (!wine) {
    return NextResponse.json({ error: "Wine not found" }, { status: 404 });
  }

  const {
    certificates,
    purchasePrice,
    currentValue,
    imageKey,
    valuations,
    ...rest
  } = wine;
  const cert = certificates[0] ?? null;

  return NextResponse.json({
    ...rest,
    purchasePrice: Number(purchasePrice),
    currentValue: Number(currentValue),
    photoUrl: getPublicUrl(imageKey),
    valuations: valuations.map((v) => ({ ...v, price: Number(v.price) })),
    certificate: cert
      ? {
          certificateNumber: cert.certificateNumber,
          dataIntegrityHash: cert.dataIntegrityHash,
          monitoringStart: cert.monitoringStart.toISOString(),
          monitoringEnd: cert.monitoringEnd.toISOString(),
          verifyPath: `/verify/${cert.dataIntegrityHash}`,
        }
      : null,
  });
}
