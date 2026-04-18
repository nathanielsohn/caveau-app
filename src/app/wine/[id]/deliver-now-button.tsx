"use client";

/**
 * Deliver Now entry point on the wine detail page (feature #51, Step 3).
 *
 * Only rendered for wines currently in a locker slot (gated server-side).
 * Opens a <dialog> with the member's last-used address pre-filled, POSTs to
 * /api/deliveries, then redirects to /deliveries/<id>?showPin=<pin>. The
 * target page strips ?showPin= after rendering the one-shot PIN card — this
 * is the only place in the app where the PIN is ever surfaced.
 */

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Loader2, AlertTriangle } from "lucide-react";

export interface DeliverNowAddressDefaults {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
}

interface DeliverNowButtonProps {
  wineId: string;
  wineName: string;
  defaultAddress: DeliverNowAddressDefaults | null;
}

export default function DeliverNowButton({
  wineId,
  wineName,
  defaultAddress,
}: DeliverNowButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [address, setAddress] = useState(() => ({
    line1: defaultAddress?.line1 ?? "",
    line2: defaultAddress?.line2 ?? "",
    city: defaultAddress?.city ?? "",
    state: defaultAddress?.state ?? "",
    postalCode: defaultAddress?.postalCode ?? "",
  }));

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wineIds: [wineId],
          address: {
            line1: address.line1.trim(),
            line2: address.line2.trim() || undefined,
            city: address.city.trim(),
            state: address.state.trim().toUpperCase(),
            postalCode: address.postalCode.trim(),
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        id?: string;
        pin?: string;
        error?: string;
      } | null;

      if (res.status === 429) {
        setError("Too many delivery requests. Try again in a minute.");
        return;
      }
      if (!res.ok || !data?.id || !data?.pin) {
        setError(
          data?.error === "Some wines not found"
            ? "This bottle isn't eligible for delivery."
            : "Couldn't create the delivery. Try again.",
        );
        return;
      }
      // Pass the PIN through a one-shot query param. The target page strips
      // the query via router.replace on mount so a refresh can't resurface it.
      router.push(`/deliveries/${data.id}?showPin=${encodeURIComponent(data.pin)}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-caveau-black bg-gold hover:bg-gold/90 transition-all"
      >
        <Truck size={16} />
        Deliver Now
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="bg-transparent p-0 backdrop:bg-caveau-black/80 backdrop:backdrop-blur-sm"
      >
        <div className="w-[90vw] max-w-md bg-[#141416] border border-[#2A2A30] rounded-2xl p-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
              <Truck size={14} /> Deliver Now
            </div>
            <h3 className="font-serif text-xl text-primary">
              Send {wineName} to my address
            </h3>
            <p className="mt-1 text-xs text-secondary">
              A 4-digit PIN is shown once after you confirm — save it for the
              verification step.
            </p>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Street address"
              value={address.line1}
              onChange={(e) =>
                setAddress((v) => ({ ...v, line1: e.target.value }))
              }
              disabled={isPending}
              className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
            />
            <input
              type="text"
              placeholder="Apt, suite, etc. (optional)"
              value={address.line2}
              onChange={(e) =>
                setAddress((v) => ({ ...v, line2: e.target.value }))
              }
              disabled={isPending}
              className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="City"
                value={address.city}
                onChange={(e) =>
                  setAddress((v) => ({ ...v, city: e.target.value }))
                }
                disabled={isPending}
                className="col-span-2 px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
              />
              <input
                type="text"
                required
                placeholder="State"
                maxLength={2}
                value={address.state}
                onChange={(e) =>
                  setAddress((v) => ({
                    ...v,
                    state: e.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                disabled={isPending}
                className="col-span-1 px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm uppercase focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
              />
            </div>
            <input
              type="text"
              required
              placeholder="ZIP"
              value={address.postalCode}
              onChange={(e) =>
                setAddress((v) => ({ ...v, postalCode: e.target.value }))
              }
              disabled={isPending}
              className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 px-4 py-3 rounded-xl border border-[#2A2A30] text-secondary hover:text-primary hover:border-[#3A3A44] text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Creating…
                  </>
                ) : (
                  <>Start delivery</>
                )}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
