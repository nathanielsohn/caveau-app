"use client";

import { useState, useMemo, useTransition } from "react";
import type { MigrationSource } from "@prisma/client";
import { parseCsv, CsvParseError } from "@/lib/csv-parse";
import {
  CAVEAU_FIELDS,
  CAVEAU_REQUIRED_FIELDS,
  CAVEAU_FIELD_LABELS,
  detectSource,
  suggestMapping,
  type CaveauField,
  type ColumnMapping,
} from "@/lib/migration-mapping";
import { submitMigration } from "../actions";

// 5 MiB file size cap. The underlying row-count cap (500) triggers first
// on most real exports; this is the "someone dragged a JPG in by mistake"
// guard.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_PAYLOAD_BYTES = 1_048_576;

const SOURCE_OPTIONS: { value: MigrationSource; label: string; hint: string }[] = [
  { value: "cellartracker", label: "CellarTracker", hint: "iWine / Producer export" },
  { value: "vivino", label: "Vivino", hint: "Collection CSV export" },
  { value: "other", label: "Other CSV", hint: "Custom spreadsheet" },
];

interface ParsedState {
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
}

export default function NewMigrationForm() {
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedState | null>(null);
  const [source, setSource] = useState<MigrationSource>("other");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const previewRows = useMemo(
    () => parsed?.rows.slice(0, 5) ?? [],
    [parsed?.rows],
  );

  const missingRequired = useMemo(() => {
    if (!parsed) return [];
    return CAVEAU_REQUIRED_FIELDS.filter((f) => !mapping[f]);
  }, [mapping, parsed]);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("File is too large (max 5 MB).");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("Could not read the file. Try picking it again.");
      return;
    }

    let result;
    try {
      result = parseCsv(text);
    } catch (e) {
      setError(
        e instanceof CsvParseError
          ? e.message
          : "Could not parse this file as CSV.",
      );
      return;
    }

    if (result.rows.length === 0) {
      setError("The CSV has a header row but no data rows.");
      return;
    }
    if (result.rows.length > MAX_ROWS) {
      setError(
        `Found ${result.rows.length} rows. Max is ${MAX_ROWS} per upload.`,
      );
      return;
    }

    const detected = detectSource(result.headers);
    setSource(detected);
    setMapping(suggestMapping(detected, result.headers));
    setParsed({
      filename: file.name,
      headers: result.headers,
      rows: result.rows,
    });
  }

  function handleSourceChange(next: MigrationSource) {
    setSource(next);
    if (parsed) {
      setMapping(suggestMapping(next, parsed.headers));
    }
  }

  function handleMappingChange(field: CaveauField, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value === "" ? null : value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!parsed) {
      setError("Pick a CSV first.");
      return;
    }
    if (missingRequired.length > 0) {
      setError(
        `Map these fields first: ${missingRequired
          .map((f) => CAVEAU_FIELD_LABELS[f])
          .join(", ")}.`,
      );
      return;
    }

    const payload = {
      source,
      originalFilename: parsed.filename,
      columnMapping: mapping,
      rows: parsed.rows,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson.length > MAX_PAYLOAD_BYTES) {
      setError(
        "This migration exceeds the 1 MB payload cap. Trim the file and try again.",
      );
      return;
    }

    const formData = new FormData();
    formData.set("payload", payloadJson);

    startTransition(async () => {
      const state = await submitMigration(
        { submittedAt: null, ok: false, error: null },
        formData,
      );
      if (state.error) setError(state.error);
      // On success, submitMigration redirects server-side.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="file"
          className="block text-xs text-muted uppercase tracking-wider mb-2"
        >
          CSV file
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="block w-full text-sm text-secondary file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-gold/10 file:text-gold hover:file:bg-gold/20 file:cursor-pointer file:text-sm file:font-medium"
        />
        {parsed && (
          <p className="text-[11px] text-muted mt-2">
            {parsed.filename} · {parsed.headers.length} columns ·{" "}
            {parsed.rows.length} rows
          </p>
        )}
      </div>

      {parsed && (
        <>
          <div>
            <p className="block text-xs text-muted uppercase tracking-wider mb-2">
              Source
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SOURCE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex flex-col gap-0.5 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    source === opt.value
                      ? "bg-gold/10 border-gold/40 text-primary"
                      : "bg-[#1C1C20] border-[#2A2A30]/50 text-secondary hover:border-[#2A2A30]"
                  }`}
                >
                  <input
                    type="radio"
                    name="source"
                    value={opt.value}
                    checked={source === opt.value}
                    onChange={() => handleSourceChange(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-[11px] text-muted">{opt.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="block text-xs text-muted uppercase tracking-wider mb-2">
              Preview (first 5 rows)
            </p>
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b border-[#2A2A30]/50 text-[10px] uppercase tracking-wider text-muted">
                    {parsed.headers.map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-[#2A2A30]/30 last:border-0"
                    >
                      {parsed.headers.map((h) => (
                        <td
                          key={h}
                          className="px-3 py-2 text-secondary max-w-[220px] truncate"
                          title={row[h] ?? ""}
                        >
                          {row[h] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="block text-xs text-muted uppercase tracking-wider mb-2">
              Column mapping
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAVEAU_FIELDS.map((field) => {
                const required = (CAVEAU_REQUIRED_FIELDS as readonly string[]).includes(
                  field,
                );
                const value = mapping[field] ?? "";
                return (
                  <div key={field}>
                    <label
                      htmlFor={`map-${field}`}
                      className="block text-xs text-muted mb-1"
                    >
                      {CAVEAU_FIELD_LABELS[field]}
                      {required && <span className="text-danger ml-1">*</span>}
                    </label>
                    <select
                      id={`map-${field}`}
                      value={value}
                      onChange={(e) =>
                        handleMappingChange(field, e.target.value)
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
                    >
                      <option value="">— skip —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="note"
              className="block text-xs text-muted uppercase tracking-wider mb-2"
            >
              Note for the concierge team (optional)
            </label>
            <textarea
              id="note"
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Anything we should know — missing fields, unusual pricing, bottles already in the vault, etc."
              className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={pending || missingRequired.length > 0}
            className="w-full py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Submitting…" : "Submit for 48-hour migration"}
          </button>
        </>
      )}
    </form>
  );
}
