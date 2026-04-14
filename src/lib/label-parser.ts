/**
 * Wine label OCR text → structured fields (feature #24).
 *
 * Pure function — no I/O, no env reads — so it's trivial to unit test and
 * cheap to call. Heuristics are deliberately simple and brittle: the user is
 * the final arbiter on the form. We populate what we can confidently extract
 * and leave the rest blank for manual entry.
 *
 * Order of operations matters: we strip already-matched tokens (vintage,
 * varietal, region) out of the line set before guessing producer/name so we
 * don't accidentally label "Bordeaux" as the producer.
 */

export interface ParsedWineLabel {
  producer?: string;
  name?: string;
  vintage?: number;
  region?: string;
  varietal?: string;
}

// Hardcoded varietal whitelist. Case-insensitive substring match — picks up
// "CABERNET SAUVIGNON" and "Cabernet Sauvignon" alike.
const VARIETALS = [
  "Cabernet Sauvignon",
  "Pinot Noir",
  "Merlot",
  "Chardonnay",
  "Sauvignon Blanc",
  "Syrah",
  "Shiraz",
  "Riesling",
  "Malbec",
  "Sangiovese",
  "Nebbiolo",
  "Tempranillo",
  "Grenache",
  "Zinfandel",
  "Barbera",
  "Chenin Blanc",
  "Gewürztraminer",
] as const;

const REGIONS = [
  "Bordeaux",
  "Burgundy",
  "Champagne",
  "Rhône",
  "Loire",
  "Alsace",
  "Napa Valley",
  "Sonoma",
  "Willamette",
  "Russian River",
  "Tuscany",
  "Piedmont",
  "Chianti",
  "Barolo",
  "Rioja",
  "Ribera del Duero",
  "Douro",
  "Mosel",
  "Rheingau",
  "Barossa",
  "McLaren Vale",
  "Marlborough",
  "Mendoza",
  "Stellenbosch",
] as const;

// "Appellation Pauillac Contrôlée" → "Pauillac". Optional accents on the c.
const APPELLATION_RE = /Appellation\s+(.+?)\s+Contr[oô]l[eé]e/i;

const VINTAGE_RE = /\b(1[89]\d{2}|20\d{2}|21\d{2})\b/;

function findVintage(text: string): number | undefined {
  const match = text.match(VINTAGE_RE);
  if (!match) return undefined;
  const year = Number(match[1]);
  const max = new Date().getFullYear();
  if (year < 1900 || year > max) return undefined;
  return year;
}

function findVarietal(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const v of VARIETALS) {
    if (lower.includes(v.toLowerCase())) return v;
  }
  return undefined;
}

function findRegion(text: string): string | undefined {
  // Try the appellation pattern first — when it matches, the captured group
  // is more specific than the country-level whitelist.
  const ap = text.match(APPELLATION_RE);
  if (ap?.[1]) return ap[1].trim();

  const lower = text.toLowerCase();
  for (const r of REGIONS) {
    if (lower.includes(r.toLowerCase())) return r;
  }
  return undefined;
}

/**
 * Strip a phrase from a line, ignoring case and accents. Returns the line
 * unchanged if the phrase isn't present.
 */
function stripPhrase(line: string, phrase: string): string {
  const idx = line.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx < 0) return line;
  return (line.slice(0, idx) + line.slice(idx + phrase.length)).replace(/\s{2,}/g, " ").trim();
}

export function parseWineLabel(rawText: string): ParsedWineLabel {
  if (!rawText || typeof rawText !== "string") return {};

  const vintage = findVintage(rawText);
  const varietal = findVarietal(rawText);
  const region = findRegion(rawText);

  // Split into trimmed, non-empty lines.
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Producer = first line that's >3 chars, not numeric, and isn't itself a
  // matched region/varietal/vintage. The first prominent line on most labels
  // is the producer (Château X, Domaine Y, Opus One).
  let producer: string | undefined;
  for (const line of lines) {
    if (line.length <= 3) continue;
    if (/^\d+$/.test(line)) continue;
    if (vintage && line.includes(String(vintage)) && line.replace(String(vintage), "").trim().length === 0) continue;
    if (varietal && line.toLowerCase() === varietal.toLowerCase()) continue;
    if (region && line.toLowerCase() === region.toLowerCase()) continue;
    if (APPELLATION_RE.test(line)) continue;
    producer = line;
    break;
  }

  // Name = remaining lines after stripping out producer, region, varietal,
  // vintage. Capped at 100 chars.
  const nameParts: string[] = [];
  for (const line of lines) {
    if (producer && line === producer) continue;
    let cleaned = line;
    if (varietal) cleaned = stripPhrase(cleaned, varietal);
    if (region) cleaned = stripPhrase(cleaned, region);
    if (vintage) cleaned = stripPhrase(cleaned, String(vintage));
    cleaned = cleaned.replace(APPELLATION_RE, "").replace(/\s{2,}/g, " ").trim();
    // Drop standalone punctuation/short fragments
    if (cleaned.length > 2 && !/^\d+$/.test(cleaned)) {
      nameParts.push(cleaned);
    }
  }
  let name: string | undefined = nameParts.join(" ").trim();
  if (name.length === 0) {
    name = undefined;
  } else if (name.length > 100) {
    name = name.slice(0, 100).trim();
  }

  return { producer, name, vintage, region, varietal };
}
