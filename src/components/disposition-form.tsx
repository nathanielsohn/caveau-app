"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X, DollarSign, User, FileText, Calendar, ChevronDown } from "lucide-react";

const DISPOSITION_TYPES = [
  { value: "sold", label: "Sold", description: "Sold to a buyer" },
  { value: "transferred", label: "Transferred", description: "Transferred to another member" },
  { value: "consumed", label: "Consumed", description: "Opened and enjoyed" },
  { value: "gifted", label: "Gifted", description: "Given as a gift" },
  { value: "removed", label: "Removed", description: "Removed from collection" },
] as const;

interface DispositionFormProps {
  open: boolean;
  onClose: () => void;
  wineId: string;
  wineName: string;
  recordDispositionAction: (formData: FormData) => Promise<void>;
}

export default function DispositionForm({
  open,
  onClose,
  wineId,
  wineName,
  recordDispositionAction,
}: DispositionFormProps) {
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  const showSalePrice = type === "sold";
  const showRecipient = type === "transferred" || type === "gifted";

  function handleSubmit(formData: FormData) {
    setError("");
    if (!formData.get("type")) {
      setError("Please select a disposition type");
      return;
    }
    startTransition(async () => {
      try {
        await recordDispositionAction(formData);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="disposition-title"
      className="fixed inset-0 z-50 m-auto w-full max-w-md p-0 bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex items-center justify-center"
    >
      {/* Modal */}
      <div className="w-full max-h-[90vh] overflow-y-auto glass-card p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="disposition-title" className="font-serif text-xl text-primary">Record Disposition</h2>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-secondary">
          Recording disposition for{" "}
          <span className="text-primary font-medium">{wineName}</span>
        </p>

        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="wineId" value={wineId} />

          {/* Disposition Type */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-1.5">
              Disposition Type *
            </label>
            <div className="relative">
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
                aria-required="true"
                aria-label="Disposition type"
                className="appearance-none w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="">Select type...</option>
                {DISPOSITION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.description}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-1.5">
              <Calendar size={12} className="inline mr-1" aria-hidden="true" />
              Date
            </label>
            <input
              type="date"
              name="date"
              defaultValue={new Date().toISOString().split("T")[0]}
              className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          {/* Sale Price (conditional) */}
          {showSalePrice && (
            <div>
              <label className="block text-xs text-muted uppercase tracking-wide mb-1.5">
                <DollarSign size={12} className="inline mr-1" aria-hidden="true" />
                Sale Price
              </label>
              <input
                type="number"
                name="salePrice"
                min="0"
                max="10000000"
                step="0.01"
                placeholder="0.00"
                className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
          )}

          {/* Recipient (conditional) */}
          {showRecipient && (
            <div>
              <label className="block text-xs text-muted uppercase tracking-wide mb-1.5">
                <User size={12} className="inline mr-1" aria-hidden="true" />
                Recipient
              </label>
              <input
                type="text"
                name="recipient"
                maxLength={200}
                placeholder="Name of recipient"
                className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-1.5">
              <FileText size={12} className="inline mr-1" aria-hidden="true" />
              Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              maxLength={1000}
              placeholder="Optional notes..."
              className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full btn-gold py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Recording..." : "Record Disposition"}
          </button>
        </form>
      </div>
    </dialog>
  );
}
