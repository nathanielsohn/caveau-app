import Link from "next/link";
import { Wine } from "lucide-react";
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
}

export default function WineCard({ wine }: { wine: WineCardData }) {
  const change = percentChange(wine.purchasePrice, wine.currentValue) ?? 0;

  return (
    <Link href={`/wine/${wine.id}`} className="block group">
      <div className="glass-card p-4 h-full flex flex-col gap-3 transition-all duration-300 hover:border-gold/30 hover:shadow-lg hover:shadow-gold/5">
        {/* Wine image placeholder */}
        <div className="aspect-[3/4] w-full rounded-xl bg-caveau-graphite flex items-center justify-center overflow-hidden">
          {wine.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wine.imageUrl}
              alt={wine.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <Wine className="w-10 h-10 text-burgundy/60" strokeWidth={1.2} />
          )}
        </div>

        {/* Wine info */}
        <div className="flex-1 flex flex-col gap-1.5">
          <h3 className="font-serif text-sm text-primary leading-snug line-clamp-2 group-hover:text-gold transition-colors duration-200">
            {wine.name}
          </h3>
          <p className="text-xs text-secondary">{wine.vintage}</p>
          <span className="inline-flex self-start px-2 py-0.5 rounded-full text-[10px] font-medium bg-burgundy/10 text-burgundy border border-burgundy/20">
            {wine.region}
          </span>
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
