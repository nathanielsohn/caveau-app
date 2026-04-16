"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Share2, X, ChevronDown, Copy, CheckCircle2 } from "lucide-react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { showToast } from "@/components/toast";
import type { CreatePackageResult } from "@/app/handoff/actions";

interface HandoffPackageButtonProps {
  wineId: string;
  wineName: string;
  createHandoffPackageAction: (
    formData: FormData,
  ) => Promise<CreatePackageResult>;
  /** Visual variant. "card" renders a small corner icon button on top of the
   *  wine card; "list" renders an inline icon on a list row. */
  variant?: "card" | "list";
}

/**
 * Row-level button that opens a dialog to create a handoff package for a
 * single bottle. Lives outside the wine card's `<Link>` so clicking it
 * doesn't navigate to the wine detail page.
 */
export default function HandoffPackageButton({
  wineId,
  wineName,
  createHandoffPackageAction,
  variant = "card",
}: HandoffPackageButtonProps) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function reset() {
    setOpen(false);
    setShareUrl(null);
    setCopied(false);
    setError("");
  }

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createHandoffPackageAction(formData);
      if (!result.ok || !result.shareToken) {
        setError(result.error ?? "Failed to create package");
        return;
      }
      const url = `${window.location.origin}/handoff/${result.shareToken}`;
      setShareUrl(url);
      showToast(`Handoff package ready for ${wineName}`);
    });
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Copy failed — select the link manually", "error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        aria-label={`Create handoff package for ${wineName}`}
        title="Create handoff package"
        className={
          variant === "card"
            ? "absolute top-2 right-2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-caveau-black/70 border border-[#2A2A30]/60 backdrop-blur text-gold opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-caveau-black/90 hover:border-gold/40 transition-all"
            : "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-secondary hover:text-gold hover:bg-caveau-graphite transition-colors flex-shrink-0"
        }
      >
        <Share2 size={variant === "card" ? 15 : 16} />
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          onClose={reset}
          aria-labelledby="handoff-title"
          className="fixed inset-0 z-50 m-auto w-full max-w-md p-0 bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex items-center justify-center"
        >
          <div className="w-full max-h-[90vh] overflow-y-auto glass-card p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h2
                id="handoff-title"
                className="font-serif text-xl text-primary"
              >
                Handoff Package
              </h2>
              <button
                type="button"
                onClick={reset}
                aria-label="Close"
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted hover:text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-secondary">
              Bundle the provenance, Sentinel history, current valuation, and
              photo for{" "}
              <span className="text-primary font-medium">{wineName}</span> into
              a single shareable link.
            </p>

            {shareUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-ok">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">Package ready</span>
                </div>
                <div className="bg-caveau-graphite border border-[#2A2A30] rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                    Share link
                  </p>
                  <code className="block text-xs text-gold-text break-all font-mono">
                    {shareUrl}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="btn-gold flex items-center gap-2 flex-1 justify-center"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 size={14} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copy link
                      </>
                    )}
                  </button>
                  <a
                    href="/handoff"
                    className="text-sm text-secondary hover:text-gold px-3 py-2 transition-colors"
                  >
                    View all
                  </a>
                </div>
              </div>
            ) : (
              <form action={handleSubmit} className="space-y-4">
                <input type="hidden" name="wineId" value={wineId} />

                {error && (
                  <div
                    role="alert"
                    className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="handoff-recipient-name"
                    className="block text-xs text-muted uppercase tracking-wide mb-1.5"
                  >
                    Recipient name *
                  </label>
                  <input
                    id="handoff-recipient-name"
                    type="text"
                    name="recipientName"
                    required
                    maxLength={200}
                    placeholder="Christie's — Peter Johnson"
                    className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="handoff-recipient-email"
                    className="block text-xs text-muted uppercase tracking-wide mb-1.5"
                  >
                    Recipient email *
                  </label>
                  <input
                    id="handoff-recipient-email"
                    type="email"
                    name="recipientEmail"
                    required
                    maxLength={254}
                    placeholder="peter.johnson@christies.com"
                    className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="handoff-channel"
                    className="block text-xs text-muted uppercase tracking-wide mb-1.5"
                  >
                    Channel *
                  </label>
                  <div className="relative">
                    <select
                      id="handoff-channel"
                      name="channel"
                      required
                      defaultValue="auction"
                      className="appearance-none w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
                    >
                      <option value="auction">Auction house</option>
                      <option value="broker">Broker</option>
                      <option value="private">Private sale</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="handoff-expiry"
                    className="block text-xs text-muted uppercase tracking-wide mb-1.5"
                  >
                    Link expires in
                  </label>
                  <div className="relative">
                    <select
                      id="handoff-expiry"
                      name="expiresInDays"
                      defaultValue="30"
                      className="appearance-none w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="">Never</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full btn-gold py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Creating..." : "Generate share link"}
                </button>
              </form>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
