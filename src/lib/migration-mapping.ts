/**
 * Source detection + column-mapping suggestions for the concierge
 * migration feature (#52).
 *
 * CellarTracker and Vivino both export UTF-8 CSV with stable header
 * names, so we can auto-detect which service the file came from and
 * preset the Caveau field → source-header mapping. The member can
 * override; staff can correct before fulfillment.
 *
 * drinkWindowStart/End are intentionally omitted — neither source
 * exports drink windows, and the member's wizard would just show a
 * greyed "— not available —" for them.
 */

import type { MigrationSource } from "@prisma/client";

export const CAVEAU_FIELDS = [
  "name",
  "vintage",
  "region",
  "varietal",
  "producer",
  "purchasePrice",
  "tastingNotes",
] as const;
export type CaveauField = (typeof CAVEAU_FIELDS)[number];

export const CAVEAU_REQUIRED_FIELDS = [
  "name",
  "vintage",
  "region",
  "varietal",
  "producer",
  "purchasePrice",
] as const satisfies readonly CaveauField[];

export const CAVEAU_FIELD_LABELS: Record<CaveauField, string> = {
  name: "Wine name",
  vintage: "Vintage",
  region: "Region",
  varietal: "Varietal",
  producer: "Producer",
  purchasePrice: "Purchase price",
  tastingNotes: "Tasting notes (optional)",
};

export type ColumnMapping = Partial<Record<CaveauField, string | null>>;

const VIVINO_MARKERS = ["Wine name", "Winery"] as const;
const CELLARTRACKER_MARKERS = ["iWine", "Wine", "Varietal", "Producer"] as const;

/** Auto-detect the source service based on the header set. */
export function detectSource(headers: string[]): MigrationSource {
  const set = new Set(headers);
  if (VIVINO_MARKERS.every((h) => set.has(h))) return "vivino";
  const cellartrackerHits = CELLARTRACKER_MARKERS.filter((h) => set.has(h));
  if (set.has("iWine") || cellartrackerHits.length >= 3) return "cellartracker";
  return "other";
}

/**
 * Build the initial mapping suggestion for `source` against the
 * detected `headers`. Unknown sources get an empty mapping — staff or
 * the member maps manually.
 */
export function suggestMapping(
  source: MigrationSource,
  headers: string[],
): ColumnMapping {
  const set = new Set(headers);
  const pick = (...candidates: string[]): string | null => {
    for (const c of candidates) {
      if (set.has(c)) return c;
    }
    return null;
  };

  if (source === "vivino") {
    return {
      name: pick("Wine name"),
      vintage: pick("Vintage"),
      region: pick("Region", "Regional wine style"),
      varietal: pick("Style", "Grape varieties"),
      producer: pick("Winery"),
      purchasePrice: pick("Purchase price"),
      tastingNotes: pick("Review", "Note"),
    };
  }

  if (source === "cellartracker") {
    return {
      name: pick("Wine"),
      vintage: pick("Vintage"),
      region: pick("Region", "SubRegion", "Locale", "Country"),
      varietal: pick("Varietal", "MasterVarietal", "Type"),
      producer: pick("Producer"),
      purchasePrice: pick("Price", "MyPrice", "Valuation"),
      tastingNotes: pick("CTNote", "MyNote", "PrivateNote"),
    };
  }

  return {};
}
