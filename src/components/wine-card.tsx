import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface WineCardProps {
  id: string;
  name: string;
  vintage: number;
  region: string;
  currentValue: number | string;
}

/** Deterministic gradient based on wine name — gives each card a unique look */
function wineGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Pick hue in the red-purple wine range (320-360, 0-20)
  const hue = ((hash % 60) + 320) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 40%, 15%) 0%, hsl(${(hue + 30) % 360}, 30%, 8%) 100%)`;
}

export default function WineCard({
  id,
  name,
  vintage,
  region,
  currentValue,
}: WineCardProps) {
  return (
    <Link href={`/wine/${id}`} className="block group">
      <div className="glass-card overflow-hidden transition-all duration-300 group-hover:border-gold/30 group-hover:shadow-lg group-hover:shadow-gold/5">
        {/* Placeholder image area with wine-colored gradient */}
        <div
          className="h-40 w-full flex items-end justify-center relative"
          style={{ background: wineGradient(name) }}
        >
          {/* Stylized wine bottle silhouette */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="w-8 h-28 rounded-t-full rounded-b-sm bg-white/10" />
          </div>
          {/* Vintage badge overlay */}
          <span className="absolute top-3 right-3 text-xs font-medium text-primary/70 bg-caveau-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full">
            {vintage}
          </span>
        </div>

        {/* Card content */}
        <div className="p-4 space-y-3">
          <h3 className="font-serif text-base text-primary leading-snug line-clamp-2 group-hover:text-gold transition-colors duration-200">
            {name}
          </h3>

          <div className="flex items-center justify-between">
            <span className="badge bg-burgundy/15 text-burgundy text-xs">
              {region}
            </span>
            <span className="text-sm font-semibold text-gold">
              {formatCurrency(currentValue)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
