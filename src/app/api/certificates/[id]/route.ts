import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
