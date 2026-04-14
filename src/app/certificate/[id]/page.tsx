import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import CertificateDoc, { PrintButton } from "@/components/certificate-doc";
import ProvenanceTimeline from "@/components/provenance-timeline";
import { buildProvenanceBundle } from "@/lib/provenance";

export const dynamic = "force-dynamic";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const { id } = await params;
  const certificate = await prisma.provenanceCertificate.findFirst({
    where: { id, wine: { memberId: session.user.id } },
    include: {
      wine: {
        select: {
          id: true,
          name: true,
          vintage: true,
          region: true,
          producer: true,
        },
      },
      locker: {
        select: {
          lockerNumber: true,
          zone: true,
        },
      },
    },
  });

  if (!certificate) {
    notFound();
  }

  const provenance = await buildProvenanceBundle(certificate.id, session.user.id);

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: #1a1a1a !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .certificate-document {
            max-width: 100% !important;
            margin: 0 !important;
          }
          .certificate-document > div {
            border-color: #B8960C !important;
            box-shadow: inset 0 0 0 2px white, inset 0 0 0 4px #B8960C !important;
          }
          .certificate-document > div > div {
            background: white !important;
          }
          .certificate-document * {
            color-adjust: exact !important;
          }
          main {
            margin-left: 0 !important;
            padding-bottom: 0 !important;
          }
        }
      `}</style>

      {/* Top bar with actions (hidden in print) */}
      <div className="no-print sticky top-0 z-10 bg-caveau-black/90 backdrop-blur border-b border-[#2A2A30]/50">
        <div className="max-w-[720px] mx-auto flex items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href={`/wine/${certificate.wine.id}`}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            Back to wine
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Certificate */}
      <div className="px-4 py-8 sm:py-12">
        <CertificateDoc certificate={certificate} />
        {provenance ? (
          <div className="no-print">
            <ProvenanceTimeline bundle={provenance} />
          </div>
        ) : null}
      </div>
    </>
  );
}
