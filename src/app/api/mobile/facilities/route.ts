import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileMember } from "@/lib/mobile-auth";

export async function GET(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  const facilities =
    auth.member.role === "admin" || auth.member.role === "staff"
      ? await prisma.facility.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            location: true,
            type: true,
            privateLocationKind: true,
          },
        })
      : await prisma.facilityMember.findMany({
          where: {
            memberId: auth.member.id,
            OR: [
              { facility: { type: "vault" } },
              {
                facility: {
                  type: "private_location",
                  ownerMemberId: auth.member.id,
                },
              },
            ],
          },
          orderBy: { facility: { name: "asc" } },
          select: {
            facility: {
              select: {
                id: true,
                name: true,
                location: true,
                type: true,
                privateLocationKind: true,
              },
            },
          },
        }).then((rows) => rows.map((r) => r.facility));

  return NextResponse.json({ facilities });
}
