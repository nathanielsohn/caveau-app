import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { toNumber } from "@/lib/utils";
import InsightsClient, {
  type InsightSegment,
  type InsightsData,
} from "./insights-client";

export const dynamic = "force-dynamic";

type SegmentDraft = Omit<InsightSegment, "percent">;

const VALUE_BANDS = [
  { key: "under-100", label: "Under $100", min: 0, max: 100 },
  { key: "100-250", label: "$100-$250", min: 100, max: 250 },
  { key: "250-500", label: "$250-$500", min: 250, max: 500 },
  { key: "500-1000", label: "$500-$1K", min: 500, max: 1000 },
  { key: "1000-plus", label: "$1K+", min: 1000, max: Number.POSITIVE_INFINITY },
] as const;

function addSegment(
  map: Map<string, SegmentDraft>,
  key: string,
  label: string,
  value: number,
) {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.value += value;
    return;
  }
  map.set(key, { key, label, count: 1, value });
}

function withPercents(
  segments: SegmentDraft[],
  totalCount: number,
): InsightSegment[] {
  return segments.map((segment) => ({
    ...segment,
    value: Math.round(segment.value),
    percent: totalCount > 0 ? Math.round((segment.count / totalCount) * 100) : 0,
  }));
}

function topWithOther(
  segments: SegmentDraft[],
  totalCount: number,
  limit = 6,
): InsightSegment[] {
  const sorted = [...segments].sort(
    (a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label),
  );
  if (sorted.length <= limit) return withPercents(sorted, totalCount);

  const visible = sorted.slice(0, limit - 1);
  const other = sorted.slice(limit - 1).reduce<SegmentDraft>(
    (acc, segment) => ({
      ...acc,
      count: acc.count + segment.count,
      value: acc.value + segment.value,
    }),
    { key: "other", label: "Other", count: 0, value: 0 },
  );

  return withPercents([...visible, other], totalCount);
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferWineType(
  name: string,
  varietal: string,
  region: string,
): { key: string; label: string } {
  const text = normalizedText(`${name} ${varietal} ${region}`);
  if (
    text.includes("champagne") ||
    text.includes("sparkling") ||
    text.includes("prosecco") ||
    text.includes("cava")
  ) {
    return { key: "sparkling", label: "Sparkling" };
  }
  if (text.includes("rose")) {
    return { key: "rose", label: "Rose" };
  }
  if (
    text.includes("sauternes") ||
    text.includes("port") ||
    text.includes("sherry") ||
    text.includes("madeira") ||
    text.includes("tokaji")
  ) {
    return text.includes("port") || text.includes("sherry") || text.includes("madeira")
      ? { key: "fortified", label: "Fortified" }
      : { key: "dessert", label: "Dessert" };
  }
  if (
    text.includes("chardonnay") ||
    text.includes("sauvignon blanc") ||
    text.includes("riesling") ||
    text.includes("pinot grigio") ||
    text.includes("pinot gris") ||
    text.includes("chenin blanc") ||
    text.includes("semillon") ||
    text.includes("viognier") ||
    text.includes("albarino")
  ) {
    return { key: "white", label: "White" };
  }
  if (
    text.includes("cabernet") ||
    text.includes("pinot noir") ||
    text.includes("merlot") ||
    text.includes("syrah") ||
    text.includes("shiraz") ||
    text.includes("nebbiolo") ||
    text.includes("sangiovese") ||
    text.includes("malbec") ||
    text.includes("grenache") ||
    text.includes("tempranillo") ||
    text.includes("zinfandel")
  ) {
    return { key: "red", label: "Red" };
  }
  return { key: "other", label: "Other" };
}

function decadeForVintage(vintage: number): string {
  const decade = Math.floor(vintage / 10) * 10;
  return `${decade}s`;
}

function valueBand(value: number): { key: string; label: string } {
  const band = VALUE_BANDS.find((b) => value >= b.min && value < b.max);
  return band ?? { key: "1000-plus", label: "$1K+" };
}

function drinkStatus(
  start: number | null,
  end: number | null,
): { key: string; label: string } {
  const year = new Date().getUTCFullYear();
  if (!start && !end) return { key: "none", label: "No window" };
  if (end && year > end) return { key: "past", label: "Past peak" };
  if (start && year >= start && (!end || year <= end)) {
    return { key: "ready", label: "Ready now" };
  }
  if (start && year < start) return { key: "aging", label: "Aging" };
  return { key: "none", label: "No window" };
}

export default async function InsightsPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const wines = await prisma.wine.findMany({
    where: { memberId: session.user.id, status: "in_cellar" },
    orderBy: { currentValue: "desc" },
    select: {
      name: true,
      vintage: true,
      region: true,
      varietal: true,
      currentValue: true,
      drinkWindowStart: true,
      drinkWindowEnd: true,
    },
  });

  const totalBottles = wines.length;
  const totalValue = Math.round(
    wines.reduce((sum, wine) => sum + toNumber(wine.currentValue), 0),
  );

  const regions = new Map<string, SegmentDraft>();
  const decades = new Map<string, SegmentDraft>();
  const types = new Map<string, SegmentDraft>();
  const valueBands = new Map<string, SegmentDraft>();
  const drinkWindows = new Map<string, SegmentDraft>();

  for (const wine of wines) {
    const value = toNumber(wine.currentValue);
    const region = wine.region.trim() || "Unknown";
    const type = inferWineType(wine.name, wine.varietal, wine.region);
    const band = valueBand(value);
    const window = drinkStatus(wine.drinkWindowStart, wine.drinkWindowEnd);
    const decade = decadeForVintage(wine.vintage);

    addSegment(regions, region, region, value);
    addSegment(decades, decade, decade, value);
    addSegment(types, type.key, type.label, value);
    addSegment(valueBands, band.key, band.label, value);
    addSegment(drinkWindows, window.key, window.label, value);
  }

  const decadeOrder = (label: string) => Number.parseInt(label, 10) || 0;
  const orderedValueBands = VALUE_BANDS.map((band) => valueBands.get(band.key)).filter(
    Boolean,
  ) as SegmentDraft[];
  const drinkOrder = ["ready", "aging", "past", "none"];

  const data: InsightsData = {
    totalBottles,
    totalValue,
    averageValue: totalBottles > 0 ? Math.round(totalValue / totalBottles) : 0,
    regions: topWithOther(Array.from(regions.values()), totalBottles),
    decades: withPercents(
      Array.from(decades.values()).sort(
        (a, b) => decadeOrder(a.label) - decadeOrder(b.label),
      ),
      totalBottles,
    ),
    types: withPercents(
      Array.from(types.values()).sort(
        (a, b) => b.count - a.count || b.value - a.value,
      ),
      totalBottles,
    ),
    valueBands: withPercents(orderedValueBands, totalBottles),
    drinkWindows: withPercents(
      Array.from(drinkWindows.values()).sort(
        (a, b) => drinkOrder.indexOf(a.key) - drinkOrder.indexOf(b.key),
      ),
      totalBottles,
    ),
  };

  return <InsightsClient data={data} />;
}
