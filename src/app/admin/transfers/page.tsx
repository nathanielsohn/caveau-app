import { ArrowRightLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import TransferClient from "./transfer-client";

export const dynamic = "force-dynamic";

export default async function AdminTransfersPage() {
  const facilities = await prisma.facility.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <ArrowRightLeft className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Transfers</h1>
            <p className="text-sm text-muted">
              Cross-facility moves with slot-level audit trail.
            </p>
          </div>
        </div>
      </div>

      <TransferClient facilities={facilities} />
    </div>
  );
}

