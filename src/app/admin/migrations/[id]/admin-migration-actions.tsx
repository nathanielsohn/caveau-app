"use client";

import { useState, useTransition } from "react";
import type { MigrationStatus } from "@prisma/client";
import {
  CAVEAU_FIELDS,
  CAVEAU_REQUIRED_FIELDS,
  CAVEAU_FIELD_LABELS,
  type CaveauField,
  type ColumnMapping,
} from "@/lib/migration-mapping";
import {
  updateMigrationMapping,
  fulfillMigration,
  failMigration,
  INITIAL_ADMIN_MIGRATION_STATE,
} from "../actions";

export default function AdminMigrationActions({
  id,
  status,
  rowCount,
  headers,
  initialMapping,
}: {
  id: string;
  status: MigrationStatus;
  rowCount: number;
  headers: string[];
  initialMapping: ColumnMapping;
}) {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(INITIAL_ADMIN_MIGRATION_STATE);
  const [failing, setFailing] = useState(false);
  const [failureReason, setFailureReason] = useState("");

  const locked = status !== "submitted";
  const missingRequired = CAVEAU_REQUIRED_FIELDS.filter((f) => !mapping[f]);

  function handleSave() {
    setState(INITIAL_ADMIN_MIGRATION_STATE);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("columnMapping", JSON.stringify(mapping));
    startTransition(async () => {
      const next = await updateMigrationMapping(
        INITIAL_ADMIN_MIGRATION_STATE,
        formData,
      );
      setState(next);
    });
  }

  function handleFulfill() {
    setState(INITIAL_ADMIN_MIGRATION_STATE);
    const formData = new FormData();
    formData.set("id", id);
    // Persist the latest mapping first, then fulfill in one user click.
    formData.set("columnMapping", JSON.stringify(mapping));
    startTransition(async () => {
      const saved = await updateMigrationMapping(
        INITIAL_ADMIN_MIGRATION_STATE,
        formData,
      );
      if (!saved.ok) {
        setState(saved);
        return;
      }
      const fulfillForm = new FormData();
      fulfillForm.set("id", id);
      const next = await fulfillMigration(
        INITIAL_ADMIN_MIGRATION_STATE,
        fulfillForm,
      );
      setState(next);
    });
  }

  function handleFail() {
    setState(INITIAL_ADMIN_MIGRATION_STATE);
    if (!failureReason.trim()) {
      setState({
        submittedAt: Date.now(),
        ok: false,
        error: "Reason is required.",
        message: null,
      });
      return;
    }
    const formData = new FormData();
    formData.set("id", id);
    formData.set("failureReason", failureReason.trim());
    startTransition(async () => {
      const next = await failMigration(INITIAL_ADMIN_MIGRATION_STATE, formData);
      setState(next);
      if (next.ok) {
        setFailing(false);
        setFailureReason("");
      }
    });
  }

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-serif text-xl text-primary">Column mapping</h2>
        {locked && (
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Locked · {status}
          </span>
        )}
      </div>

      {state.error && (
        <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm mb-4">
          {state.error}
        </div>
      )}
      {state.message && state.ok && (
        <div className="px-4 py-3 rounded-xl bg-ok/10 border border-ok/20 text-ok text-sm mb-4">
          {state.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
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
                disabled={locked}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [field as CaveauField]:
                      e.target.value === "" ? null : e.target.value,
                  }))
                }
                className="w-full px-3 py-2 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">— skip —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {!locked && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-secondary text-sm hover:text-primary hover:border-[#2A2A30]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save mapping
            </button>
            <button
              type="button"
              onClick={handleFulfill}
              disabled={pending || missingRequired.length > 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? "Working…" : `Fulfill ${rowCount} wines`}
            </button>
            <button
              type="button"
              onClick={() => setFailing((v) => !v)}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-danger/30 text-danger text-sm hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Mark needs attention
            </button>
          </div>

          {missingRequired.length > 0 && (
            <p className="text-[11px] text-muted mt-3">
              Map {missingRequired.map((f) => CAVEAU_FIELD_LABELS[f]).join(", ")}{" "}
              before fulfilling.
            </p>
          )}

          {failing && (
            <div className="mt-4 p-4 rounded-xl bg-[#1C1C20] border border-danger/20">
              <label
                htmlFor="failureReason"
                className="block text-xs text-muted mb-2"
              >
                Tell the member what went wrong
              </label>
              <textarea
                id="failureReason"
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-[#0A0A0B] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-danger/40 focus:ring-1 focus:ring-danger/25 resize-none"
                placeholder="e.g. File appears to be a Vivino wishlist, not an owned-wines export."
              />
              <div className="flex items-center gap-3 mt-3">
                <button
                  type="button"
                  onClick={handleFail}
                  disabled={pending}
                  className="px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-medium hover:bg-danger/90 disabled:opacity-50 transition-colors"
                >
                  Send to member
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFailing(false);
                    setFailureReason("");
                  }}
                  className="text-xs text-muted hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
