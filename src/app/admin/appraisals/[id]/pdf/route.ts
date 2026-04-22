import { NextResponse } from "next/server";
import { AppraisalStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema } from "@/lib/schemas";
import { parseHeirs, parseLineItems } from "@/lib/appraisals";
import { renderAppraisalPdf } from "@/lib/appraisal-pdf";
import { toNumber } from "@/lib/utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== Role.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const check = UuidSchema.safeParse(id);
  if (!check.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: check.data },
    include: { member: { select: { name: true } } },
  });

  if (!appraisal || appraisal.status !== AppraisalStatus.completed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    !appraisal.dataIntegrityHash ||
    !appraisal.appraisalNumber ||
    !appraisal.effectiveDate
  ) {
    return NextResponse.json(
      { error: "Appraisal is not fully completed" },
      { status: 409 },
    );
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
    logger.error("[admin-appraisal-pdf] render failed", {
      appraisalId: appraisal.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Unable to render PDF" },
      { status: 500 },
    );
  }
}
