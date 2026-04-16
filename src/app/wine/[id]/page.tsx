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
  classifyInvestmentTier,
  calculateCAGR,
  projectValue,
  tierLabel,
  tierDescription,
  tierBadgeClass,
  formatPercent,
} from "@/lib/investment";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  TrendingUp,
  TrendingDown,
  Grid3X3,
  Award,
  Grape,
  Building2,
  LineChart,
} from "lucide-react";
import ValuationChart from "@/components/valuation-chart";
import DispositionButton from "./disposition-button";
import WineImageUpload from "@/components/wine-image-upload";
import { getPublicUrl } from "@/lib/s3";
import { recordDisposition, requestWineUploadUrl, setWineImage } from "./actions";

interface WineDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WineDetailPage({ params }: WineDetailPageProps) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const { id } = await params;

  const wine = await prisma.wine.findUnique({
    where: { id, memberId: session.user.id },
    select: {
      id: true,
      name: true,
      vintage: true,
      region: true,
      varietal: true,
      producer: true,
      purchasePrice: true,
      currentValue: true,
      tastingNotes: true,
      drinkWindowStart: true,
      drinkWindowEnd: true,
      status: true,
      imageKey: true,
      createdAt: true,
      lastValuationSyncAt: true,
      lockerSlots: {
        select: {
          slotPosition: true,
          dateStored: true,
          locker: {
            select: { lockerNumber: true, zone: true },
          },
        },
      },
      certificates: {
        select: { id: true, certificateNumber: true },
      },
      valuations: {
        orderBy: { date: "desc" },
        select: { id: true, source: true, price: true, date: true },
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

  // Investment classification (feature #45). Uses the earliest valuation
  // as the CAGR anchor — the `valuations` selection above is ordered
  // desc, so the oldest entry is at the end of the array.
  const investmentTier = classifyInvestmentTier({
    producer: wine.producer,
    name: wine.name,
    vintage: wine.vintage,
  });
  const earliestValuation =
    wine.valuations.length > 0 ? wine.valuations[wine.valuations.length - 1] : null;
  const anchorPrice = earliestValuation
    ? toNumber(earliestValuation.price)
    : purchasePrice;
  const anchorDate = earliestValuation?.date ?? wine.createdAt;
  const cagr = calculateCAGR(anchorPrice, currentValue, anchorDate);
  const projectedFive = cagr != null ? projectValue(currentValue, cagr, 5) : null;

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

    // Create valuation, then only overwrite wine.currentValue if this new
    // entry is the latest by date. A backdated valuation must not clobber
    // the current market value.
    await prisma.$transaction(async (tx) => {
      const created = await tx.wineValuation.create({
        data: {
          wineId,
          source: sourceStr,
          price: priceNum,
          date: dateVal,
        },
      });
      const latest = await tx.wineValuation.findFirst({
        where: { wineId },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (latest?.id === created.id) {
        await tx.wine.update({
          where: { id: wineId },
          data: { currentValue: priceNum },
        });
      }
    });

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

      {/* Header: bottle photo (uploadable) + wine info */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Bottle photo — feature #18 */}
          <WineImageUpload
            wineId={wine.id}
            initialUrl={getPublicUrl(wine.imageKey)}
            requestUrlAction={requestWineUploadUrl}
            setImageAction={setWineImage}
          />

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

            {/* Drink window — only render if at least one bound is set, and
                use directional copy when only one side is known so we never
                show a literal "? – 2030" or "2025 – ?". */}
            {(wine.drinkWindowStart || wine.drinkWindowEnd) && (
              <p className="text-sm text-muted">
                Drink window:{" "}
                <span className="text-secondary">
                  {wine.drinkWindowStart && wine.drinkWindowEnd
                    ? `${wine.drinkWindowStart} – ${wine.drinkWindowEnd}`
                    : wine.drinkWindowStart
                      ? `from ${wine.drinkWindowStart}`
                      : `through ${wine.drinkWindowEnd}`}
                </span>
              </p>
            )}

            {/* Disposition button / status badge */}
            <div className="pt-2">
              <DispositionButton
                wineId={wine.id}
                wineName={wine.name}
                status={wine.status}
                recordDispositionAction={recordDisposition}
              />
            </div>
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

      {/* Investment Classification (feature #45) — only renders for
          bottles that classify into one of the six tiers. */}
      {investmentTier && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
              <LineChart className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-serif text-xl text-primary">
                  Investment Classification
                </h2>
                <Link
                  href="/portfolio"
                  className="text-xs text-gold hover:text-gold-text transition-colors"
                >
                  View portfolio →
                </Link>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium ${tierBadgeClass(investmentTier)}`}
                >
                  {tierLabel(investmentTier)}
                </span>
                <span className="text-sm text-secondary">
                  {tierDescription(investmentTier)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#2A2A30]/50">
            <div>
              <p className="text-[11px] text-muted uppercase tracking-wider">
                Anchor Price
              </p>
              <p className="text-lg font-semibold text-secondary tabular-nums mt-1">
                {formatCurrency(anchorPrice)}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {formatDate(anchorDate)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted uppercase tracking-wider">
                CAGR
              </p>
              <p
                className={`text-lg font-semibold tabular-nums mt-1 ${
                  cagr == null
                    ? "text-muted"
                    : cagr >= 0
                      ? "text-ok"
                      : "text-danger"
                }`}
              >
                {cagr != null ? formatPercent(cagr) : "—"}
              </p>
              <p className="text-[11px] text-muted mt-0.5">annualized</p>
            </div>
            <div>
              <p className="text-[11px] text-muted uppercase tracking-wider">
                5-Year Projection
              </p>
              <p className="text-lg font-semibold text-gold tabular-nums mt-1">
                {projectedFive != null ? formatCurrency(projectedFive) : "—"}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                at current CAGR
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Price History Chart */}
      <ValuationChart
        valuations={serializedValuations}
        purchasePrice={purchasePrice}
        currentValue={currentValue}
        appreciation={appreciation}
        wineId={wine.id}
        addValuationAction={addValuation}
        lastSyncedAt={
          (wine.lastValuationSyncAt ?? wine.valuations[0]?.date ?? null)?.toISOString() ?? null
        }
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

      {/* Custody & Condition Report link */}
      {certificate && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-gold" />
              </div>
              <div>
                <h2 className="font-serif text-lg text-primary">
                  Custody & Condition Report
                </h2>
                <p className="text-xs text-muted">
                  {certificate.certificateNumber}
                </p>
              </div>
            </div>
            <Link
              href={`/report/${certificate.id}`}
              className="btn-gold text-sm"
            >
              View Report
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
