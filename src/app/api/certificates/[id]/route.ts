import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema, parsePathParamOr404 } from "@/lib/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const idResult = parsePathParamOr404(UuidSchema, rawId);
  if (!idResult.ok) return idResult.response;

  // Single query enforces ownership at the WHERE clause. We do NOT split this
  // into "fetch + then check" because that lets attackers distinguish "exists
  // but not yours" from "doesn't exist" via response timing.
  const certificate = await prisma.provenanceCertificate.findFirst({
    where: { id: idResult.data, wine: { memberId: session.user.id } },
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
    // Both "no such certificate" and "not your certificate" return 404 to
    // prevent enumeration of certificate IDs.
    return NextResponse.json(
      { error: "Report not found" },
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
