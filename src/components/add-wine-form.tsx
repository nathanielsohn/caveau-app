"use client";

import { useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import ScanLabelButton from "@/components/scan-label-button";
import type {
  ScanUploadUrlResult,
  ScanWineLabelResult,
} from "@/app/collection/label-scan-actions";

interface AddWineFormProps {
  open: boolean;
  onClose: () => void;
  addWineAction: (formData: FormData) => Promise<void>;
  /** When false the Scan Label button is hidden entirely (no S3 bucket). */
  s3Configured: boolean;
  /** When false the Scan Label button renders disabled with a tooltip. */
  visionConfigured: boolean;
  requestScanUploadUrlAction: (
    contentType: string,
  ) => Promise<ScanUploadUrlResult>;
  scanWineLabelAction: (key: string) => Promise<ScanWineLabelResult>;
}

export default function AddWineForm({
  open,
  onClose,
  addWineAction,
  s3Configured,
  visionConfigured,
  requestScanUploadUrlAction,
  scanWineLabelAction,
}: AddWineFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Controlled values so the Scan Label result can populate them. Empty
  // strings are sentinel "untouched" so the user keeps typing freedom.
  const [name, setName] = useState("");
  const [vintage, setVintage] = useState("");
  const [region, setRegion] = useState("");
  const [varietal, setVarietal] = useState("");
  const [producer, setProducer] = useState("");
  const [imageKey, setImageKey] = useState<string>("");

  useBodyScrollLock(open);

  if (!open) return null;

  function resetState() {
    setName("");
    setVintage("");
    setRegion("");
    setVarietal("");
    setProducer("");
    setImageKey("");
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (imageKey) formData.set("imageKey", imageKey);
    startTransition(async () => {
      try {
        await addWineAction(formData);
        formRef.current?.reset();
        resetState();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add wine");
      }
    });
  }

  function handleClose() {
    resetState();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add wine"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal — max-h uses dvh to sidestep iOS Safari's address-bar vh bug. */}
      <div className="relative w-full max-w-md glass-card p-6 max-h-[85dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-xl text-primary">Add Wine</h2>
          <button
            onClick={handleClose}
            aria-label="Close add wine form"
            className="w-11 h-11 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-[#1C1C20] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
          {/* Scan Label — only when S3 is configured. Disabled if Vision isn't. */}
          {s3Configured && (
            <ScanLabelButton
              visionConfigured={visionConfigured}
              requestUploadUrlAction={requestScanUploadUrlAction}
              scanAction={scanWineLabelAction}
              onParsed={(r) => {
                if (r.producer) setProducer(r.producer);
                if (r.name) setName(r.name);
                if (typeof r.vintage === "number") setVintage(String(r.vintage));
                if (r.region) setRegion(r.region);
                if (r.varietal) setVarietal(r.varietal);
                setImageKey(r.imageKey);
              }}
            />
          )}

          {/* Wine Name */}
          <div>
            <label htmlFor="name" className="block text-sm text-secondary mb-1.5">
              Wine Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              aria-required="true"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Château Margaux"
              className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          {/* Vintage + Region */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="vintage" className="block text-sm text-secondary mb-1.5">
                Vintage
              </label>
              <input
                id="vintage"
                name="vintage"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                required
                aria-required="true"
                value={vintage}
                onChange={(e) => setVintage(e.target.value)}
                placeholder="2020"
                className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="region" className="block text-sm text-secondary mb-1.5">
                Region
              </label>
              <input
                id="region"
                name="region"
                type="text"
                required
                aria-required="true"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Bordeaux"
                className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
          </div>

          {/* Varietal + Producer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="varietal" className="block text-sm text-secondary mb-1.5">
                Varietal
              </label>
              <input
                id="varietal"
                name="varietal"
                type="text"
                required
                aria-required="true"
                value={varietal}
                onChange={(e) => setVarietal(e.target.value)}
                placeholder="Cabernet Sauvignon"
                className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="producer" className="block text-sm text-secondary mb-1.5">
                Producer
              </label>
              <input
                id="producer"
                name="producer"
                type="text"
                required
                aria-required="true"
                value={producer}
                onChange={(e) => setProducer(e.target.value)}
                placeholder="Château Margaux"
                className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
          </div>

          {/* Purchase Price */}
          <div>
            <label htmlFor="purchasePrice" className="block text-sm text-secondary mb-1.5">
              Purchase Price (USD)
            </label>
            <input
              id="purchasePrice"
              name="purchasePrice"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              required
              aria-required="true"
              maxLength={12}
              placeholder="250.00"
              className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            className="btn-gold mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Adding..." : "Add to Collection"}
          </button>
        </form>
      </div>
    </div>
  );
}
