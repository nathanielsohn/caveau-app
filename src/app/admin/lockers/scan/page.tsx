import { ScanLine } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import ScanClient from "./scan-client";

export const dynamic = "force-dynamic";

export default async function AdminLockerScanPage() {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") notFound();

  const facilities = await prisma.facility.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <ScanLine className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">
            Check-in / Check-out
          </h1>
          <p className="text-sm text-muted">
            Scan a bottle barcode to assign it to a slot or remove it.
          </p>
        </div>
      </div>

      <ScanClient facilities={facilities} />
    </div>
  );
}

