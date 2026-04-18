"use client";

/**
 * Driver-side 3-step ladder (feature #51, Step 3).
 *
 * Steps: Start handoff → Verify ID (recipient name match) → Capture photo.
 * Resume-aware: server derives `initialStep` from the DeliveryRequest
 * status; the client refreshes after each mutation so a mid-flow close
 * and reopen lands exactly where it left off.
 */

import { FormEvent, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Camera,
  AlertTriangle,
  Truck,
  UserCheck,
  Wine,
  Users,
  MapPin,
  ShieldCheck,
  Loader2,
} from "lucide-react";

export type DriverStepKey =
  | "start"
  | "id-scan"
  | "photo"
  | "completed"
  | "cancelled"
  | "expired";

export interface DriverView {
  token: string;
  deliveryId: string;
  status: string;
  memberName: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
  items: Array<{
    id: string;
    name: string;
    vintage: number;
    producer: string;
  }>;
  recipients: Array<{
    id: string;
    name: string;
    relationship: string | null;
  }>;
}

interface LadderClientProps {
  view: DriverView;
  initialStep: DriverStepKey;
}

type ActiveStepKey = "start" | "id-scan" | "photo";
const ACTIVE_STEPS: ActiveStepKey[] = ["start", "id-scan", "photo"];

function stepIndex(step: DriverStepKey): number {
  const idx = ACTIVE_STEPS.indexOf(step as ActiveStepKey);
  return idx === -1 ? ACTIVE_STEPS.length : idx;
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 5 * 1024 * 1024;

export default function LadderClient({
  view,
  initialStep,
}: LadderClientProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [scannedName, setScannedName] = useState("");
  const [matchedName, setMatchedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const postJson = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        /* empty body is fine */
      }
      return { ok: res.ok, status: res.status, data };
    },
    [],
  );

  const handleStart = useCallback(async () => {
    if (isPending) return;
    setError(null);
    setIsPending(true);
    const res = await postJson(
      `/api/deliveries/by-token/${view.token}/handoff-start`,
    );
    setIsPending(false);
    if (!res.ok) {
      if (res.status === 409) {
        setError(
          "This delivery can't start a handoff right now. Ask dispatch to confirm the member completed verification.",
        );
      } else if (res.status === 410) {
        setError("This delivery window has expired.");
      } else {
        setError("Couldn't start the handoff. Try again.");
      }
      return;
    }
    router.refresh();
  }, [isPending, postJson, router, view.token]);

  const handleIdScan = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (isPending) return;
      const name = scannedName.trim();
      if (name.length === 0) {
        setError("Enter the name from the recipient's ID.");
        return;
      }
      setError(null);
      setIsPending(true);
      const res = await postJson(
        `/api/deliveries/by-token/${view.token}/id-scan`,
        { name },
      );
      setIsPending(false);
      if (res.status === 401) {
        setError(
          "No match found. Confirm the ID belongs to a registered recipient.",
        );
        return;
      }
      if (res.status === 429) {
        const retry =
          (res.data as { retryAfterSeconds?: number } | null)
            ?.retryAfterSeconds ?? 900;
        setError(
          `Too many attempts. Try again in ${Math.ceil(retry / 60)} minute${
            retry >= 120 ? "s" : ""
          }.`,
        );
        return;
      }
      if (!res.ok) {
        setError("Couldn't verify the ID. Try again.");
        return;
      }
      const matched = (res.data as { matchedRecipientName?: string } | null)
        ?.matchedRecipientName;
      setMatchedName(matched ?? null);
      setScannedName("");
      router.refresh();
    },
    [isPending, postJson, router, scannedName, view.token],
  );

  const handlePhoto = useCallback(
    async (file: File) => {
      if (isPending) return;
      if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
        setError("Use a JPEG, PNG, or WebP image.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("Photo must be 5MB or smaller.");
        return;
      }
      setError(null);
      setIsPending(true);
      try {
        const urlRes = await postJson(
          `/api/deliveries/by-token/${view.token}/upload-url`,
          {
            contentType: file.type,
            contentLength: file.size,
          },
        );
        if (urlRes.status === 503) {
          setError(
            "Photo upload is not configured on this server. Contact dispatch.",
          );
          return;
        }
        if (!urlRes.ok) {
          setError("Couldn't prepare the photo upload. Try again.");
          return;
        }
        const { uploadUrl, key } = urlRes.data as {
          uploadUrl: string;
          key: string;
        };

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
            "Content-Length": String(file.size),
          },
          body: file,
        });
        if (!putRes.ok) {
          setError(`Photo upload failed (${putRes.status}). Try again.`);
          return;
        }

        const completeRes = await postJson(
          `/api/deliveries/by-token/${view.token}/complete`,
          { photoKey: key },
        );
        if (!completeRes.ok) {
          setError("Photo uploaded but couldn't finalize the handoff.");
          return;
        }
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      } finally {
        setIsPending(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [isPending, postJson, router, view.token],
  );

  const fadeProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.25, ease: "easeOut" as const },
      };

  const activeIdx = stepIndex(initialStep);

  return (
    <div className="min-h-screen bg-caveau-black text-primary px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Header view={view} />

        <div className="mt-6 bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 md:p-10">
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            {ACTIVE_STEPS.map((step, idx) => {
              const realIdx = stepIndex(step);
              const completed = realIdx < activeIdx;
              const active = realIdx === activeIdx;
              return (
                <StepRow
                  key={step}
                  step={step}
                  index={idx + 1}
                  completed={completed}
                  active={active}
                >
                  <AnimatePresence mode="wait">
                    {active && (
                      <motion.div key={`active-${step}`} {...fadeProps}>
                        {step === "start" && (
                          <StartStep
                            view={view}
                            onStart={handleStart}
                            isPending={isPending}
                          />
                        )}
                        {step === "id-scan" && (
                          <IdScanStep
                            view={view}
                            value={scannedName}
                            setValue={setScannedName}
                            onSubmit={handleIdScan}
                            isPending={isPending}
                            matchedName={matchedName}
                          />
                        )}
                        {step === "photo" && (
                          <PhotoStep
                            inputRef={fileInputRef}
                            onPick={handlePhoto}
                            isPending={isPending}
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </StepRow>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header({ view }: { view: DriverView }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
        <Truck size={14} /> Caveau · Driver Handoff
      </div>
      <h1 className="font-serif text-2xl md:text-3xl text-primary">
        {view.memberName}
      </h1>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 text-ok px-2.5 py-1 text-[11px] uppercase tracking-wider">
        <ShieldCheck size={12} /> Member verification complete
      </div>
    </div>
  );
}

// ── StepRow ──────────────────────────────────────────────────────────────

const STEP_LABELS: Record<
  Exclude<DriverStepKey, "completed" | "cancelled" | "expired">,
  { title: string; subcopy: string; icon: React.ReactNode }
> = {
  start: {
    title: "Review + start handoff",
    subcopy: "Confirm the address, bottles, and authorized recipients.",
    icon: <Truck size={14} className="text-gold" />,
  },
  "id-scan": {
    title: "Verify recipient ID",
    subcopy: "Enter the name exactly as printed on the recipient's ID.",
    icon: <UserCheck size={14} className="text-gold" />,
  },
  photo: {
    title: "Capture handoff photo",
    subcopy: "Photograph the bottles with the recipient present.",
    icon: <Camera size={14} className="text-gold" />,
  },
};

function StepRow({
  step,
  index,
  completed,
  active,
  children,
}: {
  step: Exclude<DriverStepKey, "completed" | "cancelled" | "expired">;
  index: number;
  completed: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  const label = STEP_LABELS[step];
  return (
    <div
      className={[
        "rounded-xl border p-4 md:p-5 transition-colors",
        active
          ? "border-gold/40 bg-gold/5"
          : completed
            ? "border-[#2A2A30] bg-[#141416]/40"
            : "border-[#2A2A30]/60 bg-[#141416]/20",
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        <div
          className={[
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5",
            completed
              ? "bg-gold text-caveau-black"
              : active
                ? "bg-transparent text-gold border border-gold"
                : "bg-transparent text-muted border border-[#2A2A30]",
          ].join(" ")}
          aria-current={active ? "step" : undefined}
        >
          {completed ? <Check size={14} /> : index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {label.icon}
            <h2
              className={[
                "font-serif text-base md:text-lg",
                active || completed ? "text-primary" : "text-muted",
              ].join(" ")}
            >
              {label.title}
            </h2>
          </div>
          <p
            className={[
              "text-sm mt-1",
              active ? "text-secondary" : "text-muted",
            ].join(" ")}
          >
            {label.subcopy}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Step bodies ─────────────────────────────────────────────────────────

function StartStep({
  view,
  onStart,
  isPending,
}: {
  view: DriverView;
  onStart: () => void;
  isPending: boolean;
}) {
  return (
    <div className="mt-4 space-y-4">
      <ContextCard
        icon={<MapPin size={14} className="text-gold" />}
        label="Deliver to"
      >
        <div className="text-sm text-primary">
          {view.address.line1}
          {view.address.line2 ? `, ${view.address.line2}` : ""}
        </div>
        <div className="text-xs text-secondary">
          {view.address.city}, {view.address.state} {view.address.postalCode}
        </div>
      </ContextCard>

      <ContextCard
        icon={<Wine size={14} className="text-gold" />}
        label={`Bottles · ${view.items.length}`}
      >
        <ul className="space-y-1">
          {view.items.map((it) => (
            <li key={it.id} className="text-sm text-primary flex gap-2">
              <span className="truncate">{it.name}</span>
              <span className="text-muted">({it.vintage})</span>
            </li>
          ))}
        </ul>
      </ContextCard>

      <ContextCard
        icon={<Users size={14} className="text-gold" />}
        label={`Authorized recipients · ${view.recipients.length}`}
      >
        {view.recipients.length === 0 ? (
          <p className="text-xs text-muted">
            No authorized recipients on file. Contact dispatch before
            proceeding.
          </p>
        ) : (
          <ul className="space-y-1">
            {view.recipients.map((r) => (
              <li
                key={r.id}
                className="text-sm text-primary flex items-baseline gap-2"
              >
                <span>{r.name}</span>
                {r.relationship && (
                  <span className="text-muted text-xs">· {r.relationship}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </ContextCard>

      <button
        type="button"
        onClick={onStart}
        disabled={isPending || view.recipients.length === 0}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Starting…
          </>
        ) : (
          <>Begin handoff</>
        )}
      </button>
    </div>
  );
}

function IdScanStep({
  view,
  value,
  setValue,
  onSubmit,
  isPending,
  matchedName,
}: {
  view: DriverView;
  value: string;
  setValue: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  isPending: boolean;
  matchedName: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="rounded-xl bg-[#0A0A0B]/60 border border-[#2A2A30]/40 px-3 py-3">
        <div className="flex items-center gap-1.5 text-muted mb-1">
          <Users size={12} />
          <span className="text-[10px] uppercase tracking-wider">
            On file
          </span>
        </div>
        <div className="text-xs text-secondary">
          {view.recipients.map((r) => r.name).join(" · ") || "—"}
        </div>
      </div>

      <input
        type="text"
        required
        placeholder="Name as printed on ID"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isPending}
        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
      />

      {matchedName && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 text-ok px-2.5 py-1 text-xs">
          <Check size={12} /> Matched: {matchedName}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || value.trim().length === 0}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Checking…
          </>
        ) : (
          <>Verify ID</>
        )}
      </button>
    </form>
  );
}

function PhotoStep({
  inputRef,
  onPick,
  isPending,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (file: File) => void;
  isPending: boolean;
}) {
  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-muted">
        Photograph the bottles clearly, with the recipient in-frame where
        possible. A single still image, JPEG/PNG/WebP up to 5MB.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <Camera size={16} /> Capture photo
          </>
        )}
      </button>
    </div>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────

function ContextCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[#0A0A0B]/60 border border-[#2A2A30]/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-muted mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}
