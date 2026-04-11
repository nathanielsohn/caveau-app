import Link from "next/link";
import { formatCurrency, percentChange } from "@/lib/utils";

export interface WineCardData {
  id: string;
  name: string;
  vintage: number;
  region: string;
  varietal: string;
  producer: string;
  purchasePrice: number;
  currentValue: number;
  imageUrl?: string | null;
  drinkWindowStart?: number | null;
  drinkWindowEnd?: number | null;
}

function getDrinkStatus(start?: number | null, end?: number | null): { label: string; className: string } | null {
  if (!start && !end) return null;
  const year = new Date().getFullYear();
  if (end && year > end) return { label: "Past Peak", className: "bg-danger/10 text-danger border-danger/20" };
  if (start && year >= start && (!end || year <= end)) return { label: "Ready to Drink", className: "bg-ok/10 text-ok border-ok/20" };
  if (start && year < start) return { label: "Aging", className: "bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20" };
  return null;
}

function getWineAccent(varietal: string, region: string): string {
  if (region === "Champagne") return "#C9A55C";
  const whites = ["Chardonnay", "Sauvignon Blanc", "Riesling", "Sémillon", "Pinot Gris"];
  if (whites.includes(varietal)) return "#B89B6A";
  return "#7A2842";
}

function WinePlaceholder({ wine }: { wine: WineCardData }) {
  const accent = getWineAccent(wine.varietal, wine.region);

  return (
    <div className="aspect-[3/4] w-full rounded-xl bg-[#0C0C0E] relative overflow-hidden flex items-center justify-center">
      {/* Radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 25%, ${accent}30, transparent 70%)`,
        }}
      />
      {/* Bottle silhouette */}
      <svg
        className="absolute h-[60%] opacity-[0.07]"
        viewBox="0 0 50 160"
        fill={accent}
      >
        <path d="M22 6h6v2h1v22c6 4 9 12 9 22v84c0 7-4 12-11 12H23c-7 0-11-5-11-12V52c0-10 3-18 9-22V8h1V6z" />
      </svg>
      {/* Label content */}
      <div className="relative z-10 flex flex-col items-center text-center px-4 gap-2">
        <p className="text-[9px] tracking-[0.25em] uppercase text-[#908F93] font-medium line-clamp-2 leading-relaxed">
          {wine.producer}
        </p>
        <div
          className="w-8 h-px"
          style={{ backgroundColor: accent, opacity: 0.5 }}
        />
        <p className="font-serif text-3xl text-[#E0E0E3] leading-none">
          {wine.vintage}
        </p>
        <div
          className="w-8 h-px"
          style={{ backgroundColor: accent, opacity: 0.5 }}
        />
        <p className="text-[9px] tracking-[0.2em] uppercase text-[#706F73]">
          {wine.varietal}
        </p>
      </div>
    </div>
  );
}

export default function WineCard({ wine }: { wine: WineCardData }) {
  const change = percentChange(wine.purchasePrice, wine.currentValue) ?? 0;
  const drinkStatus = getDrinkStatus(wine.drinkWindowStart, wine.drinkWindowEnd);

  return (
    <Link href={`/wine/${wine.id}`} className="block group">
      <div className="glass-card p-4 h-full flex flex-col gap-3 transition-all duration-300 hover:border-gold/30 hover:shadow-lg hover:shadow-gold/5">
        {/* Wine label */}
        <WinePlaceholder wine={wine} />

        {/* Wine info */}
        <div className="flex-1 flex flex-col gap-1.5">
          <h3 className="font-serif text-sm text-primary leading-snug line-clamp-2 group-hover:text-gold transition-colors duration-200">
            {wine.name}
          </h3>
          <p className="text-xs text-secondary">{wine.vintage}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-burgundy/10 text-burgundy border border-burgundy/20">
              {wine.region}
            </span>
            {drinkStatus && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${drinkStatus.className}`}>
                {drinkStatus.label}
              </span>
            )}
          </div>
        </div>

        {/* Value */}
        <div className="flex items-center justify-between pt-1 border-t border-[#2A2A30]/30">
          <span className="text-sm font-semibold text-primary">
            {formatCurrency(wine.currentValue)}
          </span>
          <span
            className={`text-xs font-medium ${
              change >= 0 ? "text-ok" : "text-danger"
            }`}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        </div>
      </div>
    </Link>
  );
}
