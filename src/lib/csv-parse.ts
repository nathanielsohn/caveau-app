/**
 * Minimal RFC 4180 CSV parser for the concierge migration feature (#52).
 *
 * Both CellarTracker and Vivino exports are comma-delimited UTF-8 with
 * quoted string cells (tasting notes contain commas + newlines). A
 * naive `split(",")` would shred them, but we don't need papaparse's
 * streaming/workers/worker-thread machinery for <500-row files. So
 * this is ~60 lines of hand-rolled RFC 4180.
 *
 * Handles: quoted cells, embedded commas, embedded CRLF/LF, escaped
 * quotes (`""` → `"`), BOM stripping, trailing blank lines.
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export class CsvParseError extends Error {}

export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records = tokenize(text);

  // Drop trailing fully-empty records so a file ending with `\r\n` or
  // a stray blank line doesn't yield a phantom row.
  while (records.length > 0) {
    const last = records[records.length - 1];
    if (!last || last.every((cell) => cell === "")) {
      records.pop();
    } else {
      break;
    }
  }

  const headerRow = records[0];
  if (!headerRow) {
    throw new CsvParseError("CSV is empty");
  }

  const headers = headerRow.map((h) => h.trim());
  if (headers.every((h) => h === "")) {
    throw new CsvParseError("CSV has no header row");
  }
  if (new Set(headers).size !== headers.length) {
    throw new CsvParseError("CSV has duplicate header names");
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    if (!record || record.every((cell) => cell === "")) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      row[key] = (record[j] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

function tokenize(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      record.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // Collapse CRLF into a single record terminator; bare CR falls
      // through to the \n branch below.
      if (text[i + 1] === "\n") i++;
    }
    if (ch === "\r" || ch === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}
