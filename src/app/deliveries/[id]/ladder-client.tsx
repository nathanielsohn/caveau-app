"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronRight,
  Fingerprint,
  Lock,
  MapPin,
  ShieldCheck,
  Truck,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { showToast } from "@/components/toast";

export type DeliveryStepKey =
  | "biometric"
  | "pin"
  | "address"
  | "otp"
  | "ready"
  | "completed"
  | "cancelled"
  | "expired";

export interface DeliveryView {
  id: string;
  status: string;
  isBiometricVerified: boolean;
  otpRequired: boolean;
  expiresAt: string;
  createdAt: string;
  pinVerifiedAt: string | null;
  otpVerifiedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
  items: Array<{
    id: string;
    wineId: string;
    name: string;
    vintage: number;
    producer: string;
    currentValue: number;
  }>;
  totalValueUsd: number;
  isExpired: boolean;
}

interface LadderClientProps {
  delivery: DeliveryView;
  initialStep: DeliveryStepKey;
  memberEmail: string;
}

const STEP_ORDER: DeliveryStepKey[] = ["biometric", "pin", "address", "otp"];

function stepIndex(step: DeliveryStepKey): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx === -1 ? STEP_ORDER.length : idx;
}

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function censorEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

export default function LadderClient({
  delivery,
  initialStep,
  memberEmail,
}: LadderClientProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [biometricOverlay, setBiometricOverlay] = useState(false);

  const [pinInput, setPinInput] = useState("");
  const [pinRemaining, setPinRemaining] = useState<number | null>(null);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null);

  const [otpInput, setOtpInput] = useState("");
  const [otpRemaining, setOtpRemaining] = useState<number | null>(null);
  const [otpLockedUntil, setOtpLockedUntil] = useState<number | null>(null);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState<number | null>(null);
  const [otpHasBeenSent, setOtpHasBeenSent] = useState(false);

  const [address, setAddress] = useState(() => ({
    line1: delivery.address.line1 ?? "",
    line2: delivery.address.line2 ?? "",
    city: delivery.address.city ?? "",
    state: delivery.address.state ?? "",
    postalCode: delivery.address.postalCode ?? "",
  }));

  const [cancelConfirm, setCancelConfirm] = useState(false);

  const pinInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Focus PIN input on entering that step.
  useEffect(() => {
    if (initialStep === "pin") pinInputRef.current?.focus();
    if (initialStep === "otp") otpInputRef.current?.focus();
  }, [initialStep]);

  // Lightweight ticking clock for lockout + cooldown countdowns.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const needsTick =
      pinLockedUntil !== null || otpLockedUntil !== null || otpCooldownUntil !== null;
    if (!needsTick) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [pinLockedUntil, otpLockedUntil, otpCooldownUntil]);

  const pinLockSecondsLeft =
    pinLockedUntil === null
      ? 0
      : Math.max(0, Math.ceil((pinLockedUntil - now) / 1000));
  const otpLockSecondsLeft =
    otpLockedUntil === null
      ? 0
      : Math.max(0, Math.ceil((otpLockedUntil - now) / 1000));
  const otpCooldownSecondsLeft =
    otpCooldownUntil === null
      ? 0
      : Math.max(0, Math.ceil((otpCooldownUntil - now) / 1000));

  // Clear lockouts once they expire so the user isn't stuck.
  useEffect(() => {
    if (pinLockedUntil !== null && pinLockSecondsLeft === 0) {
      setPinLockedUntil(null);
    }
  }, [pinLockedUntil, pinLockSecondsLeft]);
  useEffect(() => {
    if (otpLockedUntil !== null && otpLockSecondsLeft === 0) {
      setOtpLockedUntil(null);
    }
  }, [otpLockedUntil, otpLockSecondsLeft]);
  useEffect(() => {
    if (otpCooldownUntil !== null && otpCooldownSecondsLeft === 0) {
      setOtpCooldownUntil(null);
    }
  }, [otpCooldownUntil, otpCooldownSecondsLeft]);

  const postJson = useCallback(
    async (path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: unknown }> => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // Body may be empty; callers check the status.
      }
      return { ok: res.ok, status: res.status, data };
    },
    [],
  );

  // ── Actions ───────────────────────────────────────────────────────────

  const handleBiometric = useCallback(async () => {
    if (isPending) return;
    setError(null);
    setBiometricOverlay(true);
    const delay = prefersReducedMotion ? 250 : 900;
    await new Promise((r) => setTimeout(r, delay));
    setIsPending(true);
    const res = await postJson(`/api/deliveries/${delivery.id}/biometric`);
    setIsPending(false);
    setBiometricOverlay(false);
    if (!res.ok) {
      setError("Couldn't verify biometric. Try again.");
      return;
    }
    showToast("Biometric verified", "success");
    router.refresh();
  }, [delivery.id, isPending, postJson, prefersReducedMotion, router]);

  const handlePinSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (isPending || pinLockedUntil !== null) return;
      if (!/^\d{4}$/.test(pinInput)) {
        setError("Enter the 4-digit PIN.");
        return;
      }
      setError(null);
      setIsPending(true);
      const res = await postJson(`/api/deliveries/${delivery.id}/pin`, {
        deliveryRequestId: delivery.id,
        pin: pinInput,
      });
      setIsPending(false);

      if (res.status === 429) {
        const retry =
          (res.data as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 900;
        setPinLockedUntil(Date.now() + retry * 1000);
        setPinInput("");
        setError(
          `Too many attempts. Try again in ${Math.ceil(retry / 60)} minute${retry >= 120 ? "s" : ""}.`,
        );
        return;
      }
      if (res.status === 412) {
        setError("Biometric verification expired. Start over.");
        router.refresh();
        return;
      }
      if (!res.ok) {
        const d = res.data as { remainingAttempts?: number } | null;
        if (typeof d?.remainingAttempts === "number") {
          setPinRemaining(d.remainingAttempts);
        }
        setPinInput("");
        setError(
          d?.remainingAttempts === 0
            ? "That PIN doesn't match. No attempts remaining."
            : `That PIN doesn't match. ${d?.remainingAttempts ?? "?"} attempt${d?.remainingAttempts === 1 ? "" : "s"} left.`,
        );
        return;
      }

      showToast("PIN verified", "success");
      setPinInput("");
      setPinRemaining(null);
      router.refresh();
    },
    [delivery.id, isPending, pinInput, pinLockedUntil, postJson, router],
  );

  // Auto-submit PIN when 4 digits are entered.
  useEffect(() => {
    if (initialStep !== "pin") return;
    if (pinInput.length === 4 && !isPending && pinLockedUntil === null) {
      void handlePinSubmit();
    }
  }, [pinInput, initialStep, isPending, pinLockedUntil, handlePinSubmit]);

  const handleAddressSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (isPending) return;
      setError(null);
      setIsPending(true);
      const res = await postJson(`/api/deliveries/${delivery.id}/address`, {
        deliveryRequestId: delivery.id,
        address: {
          line1: address.line1.trim(),
          line2: address.line2.trim() || undefined,
          city: address.city.trim(),
          state: address.state.trim().toUpperCase(),
          postalCode: address.postalCode.trim(),
        },
      });
      setIsPending(false);

      if (!res.ok) {
        const d = res.data as { error?: string } | null;
        setError(d?.error === "Invalid input" ? "Check the address fields." : "Couldn't save the address.");
        return;
      }
      showToast("Address confirmed", "success");
      router.refresh();
    },
    [address, delivery.id, isPending, postJson, router],
  );

  const handleOtpSend = useCallback(async () => {
    if (isPending || otpCooldownUntil !== null) return;
    setError(null);
    setIsPending(true);
    const res = await postJson(`/api/deliveries/${delivery.id}/otp/send`);
    setIsPending(false);

    if (res.status === 429) {
      const retry =
        (res.data as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 60;
      setOtpCooldownUntil(Date.now() + retry * 1000);
      setError(`Please wait ${retry}s before requesting another code.`);
      return;
    }
    if (!res.ok) {
      setError("Couldn't send the code. Try again.");
      return;
    }
    setOtpHasBeenSent(true);
    setOtpCooldownUntil(Date.now() + 60_000);
    showToast(`Code sent to ${censorEmail(memberEmail)}`, "success");
  }, [delivery.id, isPending, memberEmail, otpCooldownUntil, postJson]);

  const handleOtpSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (isPending || otpLockedUntil !== null) return;
      if (!/^\d{6}$/.test(otpInput)) {
        setError("Enter the 6-digit code.");
        return;
      }
      setError(null);
      setIsPending(true);
      const res = await postJson(`/api/deliveries/${delivery.id}/otp`, {
        deliveryRequestId: delivery.id,
        otp: otpInput,
      });
      setIsPending(false);

      if (res.status === 429) {
        const retry =
          (res.data as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 900;
        setOtpLockedUntil(Date.now() + retry * 1000);
        setOtpInput("");
        setError(
          `Too many attempts. Try again in ${Math.ceil(retry / 60)} minute${retry >= 120 ? "s" : ""}.`,
        );
        return;
      }
      if (!res.ok) {
        const d = res.data as { remainingAttempts?: number } | null;
        if (typeof d?.remainingAttempts === "number") {
          setOtpRemaining(d.remainingAttempts);
        }
        setOtpInput("");
        setError(
          d?.remainingAttempts === 0
            ? "That code doesn't match. No attempts remaining."
            : `That code doesn't match. ${d?.remainingAttempts ?? "?"} attempt${d?.remainingAttempts === 1 ? "" : "s"} left.`,
        );
        return;
      }

      showToast("Code verified", "success");
      setOtpInput("");
      setOtpRemaining(null);
      router.refresh();
    },
    [delivery.id, isPending, otpInput, otpLockedUntil, postJson, router],
  );

  useEffect(() => {
    if (initialStep !== "otp") return;
    if (otpInput.length === 6 && !isPending && otpLockedUntil === null) {
      void handleOtpSubmit();
    }
  }, [otpInput, initialStep, isPending, otpLockedUntil, handleOtpSubmit]);

  const handleCancel = useCallback(async () => {
    if (isPending) return;
    setError(null);
    setIsPending(true);
    const res = await postJson(`/api/deliveries/${delivery.id}/cancel`);
    setIsPending(false);
    if (!res.ok) {
      setError("Couldn't cancel the delivery.");
      return;
    }
    showToast("Delivery cancelled", "success");
    setCancelConfirm(false);
    router.refresh();
  }, [delivery.id, isPending, postJson, router]);

  // ── Render ────────────────────────────────────────────────────────────

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.25, ease: "easeOut" as const },
      };

  const isTerminal =
    initialStep === "completed" ||
    initialStep === "cancelled" ||
    initialStep === "expired" ||
    initialStep === "ready";

  return (
    <div className="min-h-screen bg-caveau-black text-primary px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Header
          delivery={delivery}
          onCancel={() => setCancelConfirm(true)}
          canCancel={!isTerminal}
        />

        <div className="mt-6 bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 md:p-10">
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isTerminal ? (
            <TerminalBanner step={initialStep} delivery={delivery} />
          ) : (
            <Ladder
              currentStep={initialStep}
              delivery={delivery}
              motionProps={motionProps}
              biometric={{
                overlayOpen: biometricOverlay,
                onVerify: handleBiometric,
                isPending,
                prefersReducedMotion: !!prefersReducedMotion,
              }}
              pin={{
                value: pinInput,
                setValue: setPinInput,
                inputRef: pinInputRef,
                onSubmit: handlePinSubmit,
                remaining: pinRemaining,
                lockedSeconds: pinLockSecondsLeft,
                isPending,
              }}
              address={{
                values: address,
                setValues: setAddress,
                onSubmit: handleAddressSubmit,
                isPending,
              }}
              otp={{
                value: otpInput,
                setValue: setOtpInput,
                inputRef: otpInputRef,
                onSend: handleOtpSend,
                onSubmit: handleOtpSubmit,
                remaining: otpRemaining,
                lockedSeconds: otpLockSecondsLeft,
                cooldownSeconds: otpCooldownSecondsLeft,
                hasBeenSent: otpHasBeenSent,
                memberEmail,
                isPending,
              }}
            />
          )}
        </div>

        {cancelConfirm && (
          <CancelDialog
            onConfirm={handleCancel}
            onDismiss={() => setCancelConfirm(false)}
            isPending={isPending}
          />
        )}
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header({
  delivery,
  onCancel,
  canCancel,
}: {
  delivery: DeliveryView;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
            <Truck size={14} /> Deliver Now
          </div>
          <h1 className="font-serif text-2xl md:text-3xl text-primary">
            Delivery #{delivery.id.slice(0, 8)}
          </h1>
        </div>
        {canCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-secondary hover:text-danger text-xs transition-colors shrink-0 mt-2"
          >
            Cancel delivery
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 w-full text-left rounded-xl bg-[#141416]/60 border border-[#2A2A30]/50 px-4 py-3 hover:border-[#3A3A44] transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">
              Total value
            </div>
            <div className="font-serif text-lg text-gold">
              {formatCurrency(delivery.totalValueUsd)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted">
              Bottles
            </div>
            <div className="font-serif text-lg text-primary">
              {delivery.items.length}
            </div>
          </div>
        </div>
        {expanded && (
          <ul className="mt-3 pt-3 border-t border-[#2A2A30]/50 space-y-2">
            {delivery.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-primary">
                  {item.name}{" "}
                  <span className="text-muted">({item.vintage})</span>
                </span>
                <span className="text-secondary shrink-0">
                  {formatCurrency(item.currentValue)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </button>
    </div>
  );
}

// ── Ladder ──────────────────────────────────────────────────────────────

interface BiometricProps {
  overlayOpen: boolean;
  onVerify: () => void;
  isPending: boolean;
  prefersReducedMotion: boolean;
}

interface PinProps {
  value: string;
  setValue: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onSubmit: (e?: FormEvent) => void;
  remaining: number | null;
  lockedSeconds: number;
  isPending: boolean;
}

interface AddressProps {
  values: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
  };
  setValues: React.Dispatch<
    React.SetStateAction<{
      line1: string;
      line2: string;
      city: string;
      state: string;
      postalCode: string;
    }>
  >;
  onSubmit: (e: FormEvent) => void;
  isPending: boolean;
}

interface OtpProps {
  value: string;
  setValue: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onSend: () => void;
  onSubmit: (e?: FormEvent) => void;
  remaining: number | null;
  lockedSeconds: number;
  cooldownSeconds: number;
  hasBeenSent: boolean;
  memberEmail: string;
  isPending: boolean;
}

function Ladder({
  currentStep,
  delivery,
  motionProps,
  biometric,
  pin,
  address,
  otp,
}: {
  currentStep: DeliveryStepKey;
  delivery: DeliveryView;
  motionProps: Record<string, unknown>;
  biometric: BiometricProps;
  pin: PinProps;
  address: AddressProps;
  otp: OtpProps;
}) {
  const activeIdx = stepIndex(currentStep);
  const visibleSteps: LadderStepKey[] = delivery.otpRequired
    ? (STEP_ORDER as LadderStepKey[])
    : (STEP_ORDER.filter((s) => s !== "otp") as LadderStepKey[]);

  return (
    <div className="space-y-2">
      {visibleSteps.map((step, idx) => {
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
                <motion.div key={`active-${step}`} {...motionProps}>
                  {step === "biometric" && (
                    <BiometricStep {...biometric} />
                  )}
                  {step === "pin" && <PinStep {...pin} />}
                  {step === "address" && <AddressStep {...address} />}
                  {step === "otp" && <OtpStep {...otp} />}
                </motion.div>
              )}
            </AnimatePresence>
          </StepRow>
        );
      })}
    </div>
  );
}

type LadderStepKey = "biometric" | "pin" | "address" | "otp";

function StepRow({
  step,
  index,
  completed,
  active,
  children,
}: {
  step: LadderStepKey;
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

const STEP_LABELS: Record<
  Exclude<DeliveryStepKey, "completed" | "cancelled" | "expired" | "ready">,
  { title: string; subcopy: string; icon: React.ReactNode }
> = {
  biometric: {
    title: "Biometric verification",
    subcopy: "Confirm it's you with Face ID or Touch ID.",
    icon: <Fingerprint size={14} className="text-gold" />,
  },
  pin: {
    title: "Delivery PIN",
    subcopy: "Enter your 4-digit PIN from the app.",
    icon: <Lock size={14} className="text-gold" />,
  },
  address: {
    title: "Confirm address",
    subcopy: "Review where the bottles should arrive.",
    icon: <MapPin size={14} className="text-gold" />,
  },
  otp: {
    title: "Step-up verification code",
    subcopy: "Collections over $2,000 need an emailed one-time code.",
    icon: <ShieldCheck size={14} className="text-gold" />,
  },
};

// ── Step bodies ─────────────────────────────────────────────────────────

function BiometricStep({
  overlayOpen,
  onVerify,
  isPending,
  prefersReducedMotion,
}: BiometricProps) {
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onVerify}
        disabled={isPending || overlayOpen}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Fingerprint size={16} /> Verify with Face ID
      </button>
      <AnimatePresence>
        {overlayOpen && (
          <motion.div
            initial={prefersReducedMotion ? undefined : { opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-caveau-black/80 backdrop-blur-md flex items-center justify-center"
            aria-live="polite"
            aria-label="Biometric verification in progress"
          >
            <div className="text-center px-6">
              <div className="w-20 h-20 mx-auto rounded-full border-2 border-gold/40 flex items-center justify-center mb-4">
                <Fingerprint size={36} className="text-gold animate-pulse" />
              </div>
              <p className="font-serif text-lg text-primary">
                Looking for your face…
              </p>
              <p className="text-secondary text-sm mt-1">
                Hold still while we confirm your identity.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PinStep({
  value,
  setValue,
  inputRef,
  onSubmit,
  remaining,
  lockedSeconds,
  isPending,
}: PinProps) {
  const locked = lockedSeconds > 0;
  return (
    <form onSubmit={onSubmit} className="mt-4">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="one-time-code"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
          disabled={locked || isPending}
          className="sr-only"
          aria-label="4-digit delivery PIN"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          disabled={locked || isPending}
          className="flex gap-2 md:gap-3 disabled:opacity-50"
        >
          {[0, 1, 2, 3].map((i) => {
            const filled = value.length > i;
            const current = value.length === i;
            return (
              <span
                key={i}
                className={[
                  "w-12 h-14 md:w-14 md:h-16 rounded-xl border flex items-center justify-center text-xl md:text-2xl font-serif transition-colors",
                  filled
                    ? "border-gold/60 bg-gold/5 text-primary"
                    : current
                      ? "border-gold/40 bg-transparent text-primary"
                      : "border-[#2A2A30] bg-[#1C1C20]/60 text-muted",
                ].join(" ")}
              >
                {filled ? "•" : ""}
              </span>
            );
          })}
        </button>
      </div>

      {locked ? (
        <p className="mt-3 text-xs text-danger">
          Locked — try again in {Math.ceil(lockedSeconds / 60)} minute
          {lockedSeconds >= 120 ? "s" : ""}.
        </p>
      ) : remaining !== null ? (
        <p className="mt-3 text-xs text-muted">
          {remaining} attempt{remaining === 1 ? "" : "s"} remaining.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Auto-submits after 4 digits.
        </p>
      )}
    </form>
  );
}

function AddressStep({ values, setValues, onSubmit, isPending }: AddressProps) {
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <input
        type="text"
        required
        placeholder="Street address"
        value={values.line1}
        onChange={(e) => setValues((v) => ({ ...v, line1: e.target.value }))}
        disabled={isPending}
        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
      />
      <input
        type="text"
        placeholder="Apt, suite, etc. (optional)"
        value={values.line2}
        onChange={(e) => setValues((v) => ({ ...v, line2: e.target.value }))}
        disabled={isPending}
        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
      />
      <div className="grid grid-cols-3 gap-3">
        <input
          type="text"
          required
          placeholder="City"
          value={values.city}
          onChange={(e) => setValues((v) => ({ ...v, city: e.target.value }))}
          disabled={isPending}
          className="col-span-3 md:col-span-2 px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
        />
        <input
          type="text"
          required
          placeholder="State"
          maxLength={2}
          value={values.state}
          onChange={(e) =>
            setValues((v) => ({ ...v, state: e.target.value.toUpperCase().slice(0, 2) }))
          }
          disabled={isPending}
          className="col-span-1 px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm uppercase focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
        />
      </div>
      <input
        type="text"
        required
        placeholder="ZIP"
        value={values.postalCode}
        onChange={(e) => setValues((v) => ({ ...v, postalCode: e.target.value }))}
        disabled={isPending}
        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Saving…" : "Confirm address"}
          <ChevronRight size={16} />
        </button>
      </div>
    </form>
  );
}

function OtpStep({
  value,
  setValue,
  inputRef,
  onSend,
  onSubmit,
  remaining,
  lockedSeconds,
  cooldownSeconds,
  hasBeenSent,
  memberEmail,
  isPending,
}: OtpProps) {
  const locked = lockedSeconds > 0;
  return (
    <div className="mt-4">
      <div className="mb-4">
        <button
          type="button"
          onClick={onSend}
          disabled={isPending || cooldownSeconds > 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-transparent border border-gold/30 text-gold text-sm hover:bg-gold/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {hasBeenSent ? "Resend code" : "Send code"}
          {cooldownSeconds > 0 && (
            <span className="inline-flex items-center gap-1 text-muted text-xs">
              <Clock size={12} /> {cooldownSeconds}s
            </span>
          )}
        </button>
        <p className="mt-2 text-xs text-muted">
          We&rsquo;ll email it to {censorEmail(memberEmail)}.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoComplete="one-time-code"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={locked || isPending}
          className="sr-only"
          aria-label="6-digit verification code"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          disabled={locked || isPending}
          className="flex gap-1.5 md:gap-2 disabled:opacity-50"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const filled = value.length > i;
            const current = value.length === i;
            return (
              <span
                key={i}
                className={[
                  "w-10 h-12 md:w-11 md:h-14 rounded-lg border flex items-center justify-center text-lg md:text-xl font-serif transition-colors",
                  filled
                    ? "border-gold/60 bg-gold/5 text-primary"
                    : current
                      ? "border-gold/40 bg-transparent text-primary"
                      : "border-[#2A2A30] bg-[#1C1C20]/60 text-muted",
                ].join(" ")}
              >
                {filled ? "•" : ""}
              </span>
            );
          })}
        </button>

        {locked ? (
          <p className="mt-3 text-xs text-danger">
            Locked — try again in {Math.ceil(lockedSeconds / 60)} minute
            {lockedSeconds >= 120 ? "s" : ""}.
          </p>
        ) : remaining !== null ? (
          <p className="mt-3 text-xs text-muted">
            {remaining} attempt{remaining === 1 ? "" : "s"} remaining.
          </p>
        ) : hasBeenSent ? (
          <p className="mt-3 text-xs text-muted">
            Auto-submits after 6 digits.
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted">Request a code above, then enter it here.</p>
        )}
      </form>
    </div>
  );
}

// ── Terminal banner ─────────────────────────────────────────────────────

function TerminalBanner({
  step,
  delivery,
}: {
  step: DeliveryStepKey;
  delivery: DeliveryView;
}) {
  const config = useMemo(() => {
    if (step === "ready") {
      return {
        icon: <Truck size={36} className="text-gold" />,
        title: "Ready for handoff",
        body: "Verification complete. A Caveau courier will meet you at the address above — no further action needed in the app.",
        tone: "gold" as const,
      };
    }
    if (step === "completed") {
      return {
        icon: <Check size={36} className="text-gold" />,
        title: "Delivery complete",
        body: "Your bottles have been handed off. Thank you.",
        tone: "gold" as const,
      };
    }
    if (step === "cancelled") {
      return {
        icon: <XCircle size={36} className="text-danger" />,
        title: "Delivery cancelled",
        body: "This delivery was cancelled. You can start a new one from any vault bottle.",
        tone: "danger" as const,
      };
    }
    return {
      icon: <Clock size={36} className="text-muted" />,
      title: "Delivery expired",
      body: "This delivery window closed before handoff. Start a new one to proceed.",
      tone: "muted" as const,
    };
  }, [step]);

  return (
    <div className="text-center py-6 md:py-10">
      <div
        className={[
          "w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5",
          config.tone === "gold"
            ? "bg-gold/10 border border-gold/20"
            : config.tone === "danger"
              ? "bg-danger/10 border border-danger/20"
              : "bg-[#1C1C20] border border-[#2A2A30]",
        ].join(" ")}
      >
        {config.icon}
      </div>
      <h2 className="font-serif text-2xl text-primary mb-2">{config.title}</h2>
      <p className="text-secondary text-sm max-w-md mx-auto">{config.body}</p>

      <div className="mt-6 inline-flex items-center gap-2 text-xs text-muted">
        {delivery.items.length} bottle{delivery.items.length === 1 ? "" : "s"}{" "}
        · {formatCurrency(delivery.totalValueUsd)}
      </div>
    </div>
  );
}

// ── Cancel dialog ───────────────────────────────────────────────────────

function CancelDialog({
  onConfirm,
  onDismiss,
  isPending,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-dialog-title"
      className="fixed inset-0 z-50 bg-caveau-black/80 backdrop-blur-md flex items-center justify-center px-4"
    >
      <div className="max-w-sm w-full bg-[#141416] border border-[#2A2A30] rounded-2xl p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-danger/10 border border-danger/20 flex items-center justify-center mb-4">
          <XCircle size={24} className="text-danger" />
        </div>
        <h3 id="cancel-dialog-title" className="font-serif text-lg text-primary mb-2">
          Cancel this delivery?
        </h3>
        <p className="text-secondary text-sm mb-5">
          Cancelling invalidates the PIN and any sent code. You&rsquo;ll need to
          start a new delivery to ship these bottles.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isPending}
            className="flex-1 px-4 py-3 rounded-xl border border-[#2A2A30] text-secondary hover:text-primary hover:border-[#3A3A44] text-sm transition-colors disabled:opacity-50"
          >
            Keep delivery
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 text-sm transition-colors disabled:opacity-50"
          >
            {isPending ? "Cancelling…" : "Cancel delivery"}
          </button>
        </div>
      </div>
    </div>
  );
}
