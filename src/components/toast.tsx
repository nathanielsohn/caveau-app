"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

/**
 * Tiny self-contained toast system. No library, no context, no prop
 * drilling. Any client component can call `showToast(message, kind)` and
 * the global `<Toaster />` mounted in the root layout picks it up via a
 * window CustomEvent.
 *
 * Two kinds: "success" (gold check) and "error" (danger X). Auto-dismiss
 * after 3.5s, manual dismiss via the X button. New toasts stack; up to 4
 * are visible at a time and the oldest fall off when the cap is hit.
 */

export type ToastKind = "success" | "error";

interface ToastEventDetail {
  message: string;
  kind: ToastKind;
}

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const TOAST_EVENT = "caveau:toast";
const MAX_VISIBLE = 4;
const AUTO_DISMISS_MS = 3500;

/**
 * Dispatch a toast. Safe to call from server contexts — the event only
 * fires when `window` is defined, and silently no-ops during SSR.
 */
export function showToast(message: string, kind: ToastKind = "success"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastEventDetail>(TOAST_EVENT, {
      detail: { message, kind },
    }),
  );
}

let nextId = 1;

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<ToastEventDetail>).detail;
      if (!detail || typeof detail.message !== "string") return;
      const toast: Toast = {
        id: nextId++,
        message: detail.message,
        kind: detail.kind === "error" ? "error" : "success",
      };
      setToasts((prev) => [...prev, toast].slice(-MAX_VISIBLE));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, AUTO_DISMISS_MS);
    }
    window.addEventListener(TOAST_EVENT, handle);
    return () => window.removeEventListener(TOAST_EVENT, handle);
  }, []);

  // Always render the live region so assistive tech can observe updates
  // to an already-mounted region. Screen readers frequently miss
  // mount-with-content insertions, so the wrapper stays put and only the
  // toast list is conditionally rendered.
  return (
    <div
      // Above the bottom tab bar on mobile (h-16 + safe area), centered.
      className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
      }}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const isError = t.kind === "error";
        const Icon = isError ? XCircle : CheckCircle2;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg min-w-[260px] max-w-[90vw] ${
              isError
                ? "bg-[#2A0E12]/90 border-danger/40 text-danger"
                : "bg-[#141416]/90 border-gold/40 text-primary"
            }`}
          >
            <Icon
              size={18}
              className={isError ? "text-danger" : "text-gold"}
              aria-hidden="true"
            />
            <span className="text-sm flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() =>
                setToasts((prev) => prev.filter((x) => x.id !== t.id))
              }
              className="text-muted hover:text-primary transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
