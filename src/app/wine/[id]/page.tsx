import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  formatCurrency,
  formatDate,
  toNumber,
  percentChange,
} from "@/lib/utils";
import {
  ArrowLeft,
  Wine,
  MapPin,
  Calendar,
  TrendingUp,
  TrendingDown,
  Grid3X3,
  Award,
  Grape,
  Building2,
} from "lucide-react";
import ValuationChart from "@/components/valuation-chart";

interface WineDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WineDetailPage({ params }: WineDetailPageProps) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const { id } = await params;

  const wine = await prisma.wine.findUnique({
    where: { id, memberId: session.user.id },
    include: {
      lockerSlots: {
        include: {
          locker: true,
        },
      },
      certificates: true,
      valuations: {
        orderBy: { date: "desc" },
      },
    },
  });

  if (!wine) {
    notFound();
  }

  const purchasePrice = toNumber(wine.purchasePrice);
  const currentValue = toNumber(wine.currentValue);
  const appreciation = percentChange(wine.purchasePrice, wine.currentValue) ?? 0;
  const isPositive = appreciation >= 0;

  // Storage info — first assigned slot
  const slot = wine.lockerSlots[0] ?? null;
  const daysStored = slot?.dateStored
    ? Math.max(0, Math.floor(
        (Date.now() - new Date(slot.dateStored).getTime()) / (1000 * 60 * 60 * 24)
      ))
    : null;

  // First certificate (if any)
  const certificate = wine.certificates[0] ?? null;

  // Serialize valuations for the client chart
  const serializedValuations = wine.valuations.map((v) => ({
    id: v.id,
    source: v.source,
    price: toNumber(v.price),
    date: v.date.toISOString(),
  }));

  // Server action to add a valuation
  async function addValuation(formData: FormData) {
    "use server";

    const sess = await getServerAuth();
    if (!sess?.user?.id) throw new Error("Not authenticated");

    const priceRaw = formData.get("price") as string | null;
    const source = (formData.get("source") as string | null) ?? "manual";
    const dateRaw = formData.get("date") as string | null;
    const wineId = formData.get("wineId") as string | null;

    if (!wineId) throw new Error("Wine ID is required");

    const priceNum = priceRaw ? parseFloat(priceRaw) : NaN;
    if (isNaN(priceNum) || priceNum < 0 || priceNum > 10_000_000) {
      throw new Error("Invalid price");
    }

    const validSources = ["manual", "liv-ex", "wine-searcher", "auction"];
    const sourceStr = validSources.includes(source) ? source : "manual";

    const dateVal = dateRaw ? new Date(dateRaw) : new Date();
    if (isNaN(dateVal.getTime())) {
      throw new Error("Invalid date");
    }

    // Verify wine belongs to this member
    const w = await prisma.wine.findUnique({
      where: { id: wineId, memberId: sess.user.id },
      select: { id: true },
    });
    if (!w) throw new Error("Wine not found");

    // Create valuation and update wine's current value
    await prisma.$transaction([
      prisma.wineValuation.create({
        data: {
          wineId,
          source: sourceStr,
          price: priceNum,
          date: dateVal,
        },
      }),
      prisma.wine.update({
        where: { id: wineId },
        data: { currentValue: priceNum },
      }),
    ]);

    revalidatePath(`/wine/${wineId}`);
    revalidatePath("/collection");
    revalidatePath("/");
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href="/collection"
        className="inline-flex items-center gap-2 text-secondary hover:text-gold transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Collection
      </Link>

      {/* Header: image placeholder + wine info */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Wine image placeholder */}
          <div className="w-full md:w-48 h-56 md:h-64 rounded-xl bg-caveau-graphite border border-[#2A2A30]/50 flex items-center justify-center flex-shrink-0">
            <Wine className="w-16 h-16 text-burgundy/60" />
          </div>

          {/* Wine info */}
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-sm text-gold font-medium tracking-wide uppercase">
                {wine.vintage} Vintage
              </p>
              <h1 className="font-serif text-3xl md:text-4xl text-primary mt-1 leading-tight">
                {wine.name}
              </h1>
              <p className="text-secondary mt-2 text-lg">{wine.producer}</p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <div className="flex items-center gap-2 text-secondary">
                <Grape className="w-4 h-4 text-burgundy" />
                <span>{wine.varietal}</span>
              </div>
              <div className="flex items-center gap-2 text-secondary">
                <MapPin className="w-4 h-4 text-burgundy" />
                <span>{wine.region}</span>
              </div>
              <div className="flex items-center gap-2 text-secondary">
                <Calendar className="w-4 h-4 text-burgundy" />
                <span>Added {formatDate(wine.createdAt)}</span>
              </div>
            </div>

            {/* Drink window */}
            {(wine.drinkWindowStart || wine.drinkWindowEnd) && (
              <p className="text-sm text-muted">
                Drink window:{" "}
                <span className="text-secondary">
                  {wine.drinkWindowStart ?? "?"} &ndash;{" "}
                  {wine.drinkWindowEnd ?? "?"}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Valuation + Storage cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Valuation card */}
        <div className="glass-card p-6 space-y-5">
          <h2 className="font-serif text-xl text-primary">Valuation</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">
                Purchase Price
              </p>
              <p className="text-xl font-semibold text-secondary mt-1">
                {formatCurrency(purchasePrice)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">
                Current Value
              </p>
              <p className="text-xl font-semibold text-gold mt-1">
                {formatCurrency(currentValue)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A30]/50">
            {isPositive ? (
              <TrendingUp className="w-5 h-5 text-ok" />
            ) : (
              <TrendingDown className="w-5 h-5 text-danger" />
            )}
            <span
              className={`text-lg font-semibold ${
                isPositive ? "text-ok" : "text-danger"
              }`}
            >
              {isPositive ? "+" : ""}
              {appreciation.toFixed(1)}%
            </span>
            <span className="text-sm text-muted">appreciation</span>
          </div>

          {/* Latest valuation source */}
          {wine.valuations.length > 0 && (
            <p className="text-xs text-muted">
              Last valued:{" "}
              {formatDate(wine.valuations[0].date)} via{" "}
              {wine.valuations[0].source}
            </p>
          )}
        </div>

        {/* Storage location card */}
        <div className="glass-card p-6 space-y-5">
          <h2 className="font-serif text-xl text-primary">Storage Location</h2>

          {slot ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide">
                      Locker
                    </p>
                    <p className="text-lg font-semibold text-primary mt-0.5">
                      #{slot.locker.lockerNumber}
                    </p>
                    <p className="text-xs text-muted">{slot.locker.zone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0">
                    <Grid3X3 className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide">
                      Slot Position
                    </p>
                    <p className="text-lg font-semibold text-primary mt-0.5">
                      {slot.slotPosition}
                    </p>
                  </div>
                </div>
              </div>

              {daysStored !== null && (
                <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A30]/50">
                  <Calendar className="w-4 h-4 text-secondary" />
                  <span className="text-sm text-secondary">
                    Stored for{" "}
                    <span className="text-primary font-medium">
                      {daysStored} days
                    </span>
                  </span>
                  <span className="text-xs text-muted ml-auto">
                    since {formatDate(slot.dateStored!)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-secondary text-sm">
              This wine is not currently assigned to a locker slot.
            </p>
          )}
        </div>
      </div>

      {/* Price History Chart */}
      <ValuationChart
        valuations={serializedValuations}
        purchasePrice={purchasePrice}
        currentValue={currentValue}
        appreciation={appreciation}
        wineId={wine.id}
        addValuationAction={addValuation}
      />

      {/* Tasting Notes */}
      <div className="glass-card p-6 space-y-3">
        <h2 className="font-serif text-xl text-primary">Tasting Notes</h2>
        {wine.tastingNotes ? (
          <p className="text-secondary leading-relaxed">{wine.tastingNotes}</p>
        ) : (
          <p className="text-muted italic text-sm">
            No tasting notes recorded for this wine.
          </p>
        )}
      </div>

      {/* Provenance Certificate link */}
      {certificate && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-gold" />
              </div>
              <div>
                <h2 className="font-serif text-lg text-primary">
                  Provenance Certificate
                </h2>
                <p className="text-xs text-muted">
                  {certificate.certificateNumber}
                </p>
              </div>
            </div>
            <Link
              href={`/certificate/${certificate.id}`}
              className="btn-gold text-sm"
            >
              View Certificate
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
