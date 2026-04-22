import { NextResponse } from "next/server";
import { AppraisalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema } from "@/lib/schemas";
import { parseHeirs, parseLineItems } from "@/lib/appraisals";
import { renderAppraisalPdf } from "@/lib/appraisal-pdf";
import { toNumber } from "@/lib/utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Member-scoped PDF download. Scoping is enforced via `memberId` in the
 * findFirst query — an attacker who guesses an appraisal id for
 * someone else's document gets a 404, same shape as a truly missing id,
 * so the route doesn't leak existence.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const memberId = session.user.id;

  const { id } = await params;
  const check = UuidSchema.safeParse(id);
  if (!check.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const appraisal = await prisma.appraisal.findFirst({
    where: {
      id: check.data,
      memberId,
      status: AppraisalStatus.completed,
      revokedAt: null,
    },
    include: { member: { select: { name: true } } },
  });

  if (
    !appraisal ||
    !appraisal.dataIntegrityHash ||
    !appraisal.appraisalNumber ||
    !appraisal.effectiveDate
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const origin = new URL(req.url).origin;
    const pdfBytes = await renderAppraisalPdf({
      appraisalNumber: appraisal.appraisalNumber,
      memberName: appraisal.member.name,
      purpose: appraisal.purpose,
      basis: appraisal.basis,
      effectiveDate: appraisal.effectiveDate,
      appraiserName: appraisal.appraiserName ?? "Caveau head sommelier",
      appraiserCreds: appraisal.appraiserCreds ?? null,
      scopeOfWork: appraisal.scopeOfWork ?? null,
      bottleCount: appraisal.bottleCount ?? 0,
      totalBasisUsd: toNumber(appraisal.totalBasisUsd ?? 0),
      lineItems: parseLineItems(appraisal.lineItems),
      heirs: parseHeirs(appraisal.heirs),
      dataIntegrityHash: appraisal.dataIntegrityHash,
      verifyUrl: `${origin}/verify/appraisal/${appraisal.dataIntegrityHash}`,
      isWelcomeAppraisal: appraisal.isWelcomeAppraisal,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${appraisal.appraisalNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("[appraisal-pdf] render failed", {
      appraisalId: appraisal.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Unable to render PDF" },
      { status: 500 },
    );
  }
}
