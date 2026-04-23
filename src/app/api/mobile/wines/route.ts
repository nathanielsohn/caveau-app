import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileMember } from "@/lib/mobile-auth";
import { getPublicUrl } from "@/lib/s3";

export async function GET(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  const wines = await prisma.wine.findMany({
    where: { memberId: auth.member.id },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      vintage: true,
      region: true,
      varietal: true,
      producer: true,
      purchasePrice: true,
      currentValue: true,
      imageKey: true,
      drinkWindowStart: true,
      drinkWindowEnd: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    wines.map((w) => ({
      ...w,
      purchasePrice: Number(w.purchasePrice),
      currentValue: Number(w.currentValue),
      photoUrl: getPublicUrl(w.imageKey),
    })),
  );
}

