"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Droplet, X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { showToast } from "@/components/toast";
import { pairBottleProbeAction } from "./actions";

interface WineOption {
  id: string;
  name: string;
  vintage: number;
  producer: string;
}

interface PairProbeDialogProps {
  deviceId: string;
  deviceSerial: string;
  currentWineId: string | null;
  wines: WineOption[];
}

export default function PairProbeDialog({
  deviceId,
  deviceSerial,
  currentWineId,
  wines,
}: PairProbeDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedWineId, setSelectedWineId] = useState<string>(
    currentWineId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function openDialog() {
    setSelectedWineId(currentWineId ?? "");
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    const rawWineId = formData.get("wineId");
    const wineId =
      typeof rawWineId === "string" && rawWineId.length > 0 ? rawWineId : null;

    startTransition(async () => {
      const res = await pairBottleProbeAction({ deviceId, wineId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const wine = wines.find((w) => w.id === wineId);
      showToast(
        wine
          ? `Paired ${deviceSerial} with ${wine.vintage} ${wine.name}`
          : `Unpaired ${deviceSerial}`,
      );
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-xs text-gold hover:text-gold/80 transition-colors"
      >
        {currentWineId ? "Change pairing" : "Pair with a bottle"}
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          onClose={closeDialog}
          aria-labelledby="pair-probe-title"
          className="fixed inset-0 z-50 m-auto w-full max-w-md p-0 bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex items-center justify-center"
        >
          <div className="w-full max-h-[90vh] overflow-y-auto glass-card p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplet size={16} className="text-gold" />
                <h2
                  id="pair-probe-title"
                  className="font-serif text-xl text-primary"
                >
                  Pair Bottle Probe
                </h2>
              </div>
              <button
                onClick={closeDialog}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted hover:text-primary transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-secondary">
              Choose which bottle this probe ({" "}
              <span className="font-mono text-primary">{deviceSerial}</span> )
              should track. You can change or unpair anytime.
            </p>

            {error && (
              <div
                role="alert"
                className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2"
              >
                {error}
              </div>
            )}

            <form action={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-muted uppercase tracking-wide mb-1.5">
                  Bottle
                </label>
                <div className="relative">
                  <select
                    name="wineId"
                    value={selectedWineId}
                    onChange={(e) => setSelectedWineId(e.target.value)}
                    aria-label="Bottle to pair"
                    className="appearance-none w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
                  >
                    <option value="">— Unpaired —</option>
                    {wines.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.vintage} {w.name} — {w.producer}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                  />
                </div>
                {wines.length === 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Add a bottle to your cellar to pair this probe.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full btn-gold py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Saving..." : "Save pairing"}
              </button>
            </form>
          </div>
        </dialog>
      )}
    </>
  );
}
