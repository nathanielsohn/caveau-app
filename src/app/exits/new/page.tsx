import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ExitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { toNumber } from "@/lib/utils";
import NewExitForm, {
  type WineOption,
  type PreselectContext,
} from "./new-exit-form";

export const dynamic = "force-dynamic";

export default async function NewExitPage({
  searchParams,
}: {
  searchParams: Promise<{ wineId?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=%2Fexits%2Fnew");
  }
  const memberId = session.user.id;
  const params = await searchParams;

  // Load all in-cellar wines that aren't already subject to an open
  // exit facilitation. The form's <select> uses this for the full list;
  // when `?wineId=X` is passed we additionally hydrate context for that
  // bottle (current value + any open exit signal) so the form can
  // pre-fill the target range. Doing the wine list as one round-trip
  // and the wine context as a second (only when `wineId` is passed)
  // keeps the default path fast.
  const activeExitWineIds = await prisma.exitFacilitation.findMany({
    where: {
      memberId,
      status: { in: [ExitStatus.requested, ExitStatus.listed] },
    },
    select: { wineId: true },
  });
  const activeSet = new Set(activeExitWineIds.map((e) => e.wineId));

  const wines = await prisma.wine.findMany({
    where: { memberId, status: "in_cellar" },
    orderBy: [{ currentValue: "desc" }],
    select: {
      id: true,
      name: true,
      producer: true,
      vintage: true,
      currentValue: true,
    },
    take: 500,
  });

  const wineOptions: WineOption[] = wines
    .filter((w) => !activeSet.has(w.id))
    .map((w) => ({
      id: w.id,
      label: `${w.vintage} ${w.producer} — ${w.name}`,
      currentValueUsd: toNumber(w.currentValue),
    }));

  // Pre-select context when ?wineId= is passed (the #55 → #47 pivot).
  // Pull the open exit signal's target range if one exists so the form
  // prefills with what the signal recommended.
  let preselect: PreselectContext | null = null;
  if (params.wineId) {
    const wineMatch = wineOptions.find((w) => w.id === params.wineId);
    if (wineMatch) {
      const signal = await prisma.exitSignal.findFirst({
        where: { wineId: params.wineId, memberId, closedAt: null },
        select: {
          targetPriceLow: true,
          targetPriceHigh: true,
          rationale: true,
          strength: true,
        },
      });
      preselect = {
        wineId: wineMatch.id,
        wineLabel: wineMatch.label,
        currentValueUsd: wineMatch.currentValueUsd,
        signalTargetLow: signal ? toNumber(signal.targetPriceLow) : null,
        signalTargetHigh: signal ? toNumber(signal.targetPriceHigh) : null,
        signalRationale: signal?.rationale ?? null,
        signalStrength: signal?.strength ?? null,
      };
    }
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/exits"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to exits
      </Link>

      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
          Concierge consignment
        </p>
        <h1 className="font-serif text-3xl text-primary tracking-wide">
          Consign a bottle
        </h1>
        <p className="text-sm text-secondary mt-2">
          Pick the bottle, set a target range, and tell us anything we
          should know. We&apos;ll come back with a channel recommendation
          inside two business days.
        </p>
      </div>

      <NewExitForm wines={wineOptions} preselect={preselect} />
    </div>
  );
}
