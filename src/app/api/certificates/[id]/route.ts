import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const certificate = await prisma.provenanceCertificate.findUnique({
    where: { id },
    include: {
      wine: {
        select: {
          id: true,
          name: true,
          vintage: true,
          region: true,
          producer: true,
          varietal: true,
          memberId: true,
        },
      },
      locker: {
        select: {
          id: true,
          lockerNumber: true,
          zone: true,
        },
      },
    },
  });

  if (!certificate) {
    return NextResponse.json(
      { error: "Certificate not found" },
      { status: 404 }
    );
  }

  if (certificate.wine.memberId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serialized = {
    ...certificate,
    tempMean: certificate.tempMean ? Number(certificate.tempMean) : null,
    tempMin: certificate.tempMin ? Number(certificate.tempMin) : null,
    tempMax: certificate.tempMax ? Number(certificate.tempMax) : null,
    humidityMean: certificate.humidityMean
      ? Number(certificate.humidityMean)
      : null,
  };

  return NextResponse.json(serialized);
}
