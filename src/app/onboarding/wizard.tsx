"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SentinelModel, Tier } from "@prisma/client";
import {
  Check,
  ChevronRight,
  Crown,
  Cpu,
  Droplet,
  Lock,
  ShieldCheck,
  Sparkles,
  Wifi,
  Wine,
} from "lucide-react";
import {
  FOUNDING_BENEFITS,
  SELF_SERVE_TIERS,
  foundingSavingsUsd,
  tierSpecForDbTier,
} from "@/lib/tiers";
import {
  setOnboardingTier,
  reserveOnboardingLocker,
  installBundledDevicesAction,
  addFirstWine,
  completeOnboarding,
} from "./actions";

type Step = 1 | 2 | 3 | 4;
type ReservedLocker = { lockerNumber: number; zone: string } | null;
type InstalledDevice = { serialNumber: string; model: SentinelModel };

interface Props {
  memberName: string;
  initialTier: Tier;
  initialStep: 1 | 3 | 4;
  reservedLocker: ReservedLocker;
  facilityName: string;
  foundingWindowOpen: boolean;
  installedDevices: InstalledDevice[];
}

export default function OnboardingWizard({
  memberName,
  initialTier,
  initialStep,
  reservedLocker: initialReservedLocker,
  facilityName,
  foundingWindowOpen,
  installedDevices: initialInstalledDevices,
}: Props) {
  const { update } = useSession();
  const prefersReducedMotion = useReducedMotion();

  const [step, setStep] = useState<Step>(initialStep);
  const [tier, setTier] = useState<Tier>(initialTier);
  const [reservedLocker, setReservedLocker] = useState<ReservedLocker>(
    initialReservedLocker,
  );
  const [installedDevices, setInstalledDevices] = useState<InstalledDevice[]>(
    initialInstalledDevices,
  );
  const [installShortage, setInstallShortage] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const tierSpec = tierSpecForDbTier(tier);
  const bundleCount =
    tierSpec.bundledSentinels + tierSpec.bundledBottleProbes;
  const hasBundle = bundleCount > 0;

  function handleTierContinue() {
    setError(null);
    startTransition(async () => {
      const res = await setOnboardingTier(tier);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep(2);
    });
  }

  function handleReserveLocker() {
    setError(null);
    startTransition(async () => {
      const res = await reserveOnboardingLocker();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReservedLocker(res.data);
      setStep(3);
    });
  }

  function handleInstallDevices() {
    setError(null);
    startTransition(async () => {
      const res = await installBundledDevicesAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInstalledDevices(res.data.installed);
      setInstallShortage(res.data.shortage);
    });
  }

  function handleContinueFromDevices() {
    setError(null);
    setStep(4);
  }

  async function finish() {
    const res = await completeOnboarding();
    if (!res.ok) {
      setError(res.error);
      setSubmitted(false);
      return;
    }
    // Refresh the JWT so middleware sees the new onboarded flag, THEN
    // hard-navigate. Using window.location.assign instead of router.push
    // forces middleware to re-evaluate against the new cookie state on the
    // very next request — a router.refresh() races with the JWT update and
    // can briefly bounce the user back to /onboarding.
    await update();
    window.location.assign("/");
  }

  function handleAddWine(formData: FormData) {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    startTransition(async () => {
      const res = await addFirstWine(formData);
      if (!res.ok) {
        setError(res.error);
        setSubmitted(false);
        return;
      }
      await finish();
    });
  }

  function handleSkipWine() {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    startTransition(async () => {
      await finish();
    });
  }

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.25, ease: "easeOut" as const },
      };

  return (
    <div className="min-h-screen bg-caveau-black text-primary px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-2xl">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <span className="text-gold text-4xl">◈</span>
          <h1 className="font-serif text-2xl md:text-3xl text-primary mt-2 tracking-wide">
            Welcome to Caveau
          </h1>
          <p className="text-secondary text-sm mt-1">
            Four quick steps, {memberName.split(" ")[0]}.
          </p>
        </div>

        {/* Progress */}
        <ol className="flex items-center justify-center gap-3 mb-10" aria-label="Onboarding progress">
          {[1, 2, 3, 4].map((n) => {
            const completed = step > n;
            const active = step === n;
            return (
              <li key={n} className="flex items-center gap-3">
                <div
                  className={[
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors",
                    completed
                      ? "bg-gold text-caveau-black border-gold"
                      : active
                        ? "bg-transparent text-gold border-gold"
                        : "bg-transparent text-muted border-[#2A2A30]",
                  ].join(" ")}
                  aria-current={active ? "step" : undefined}
                >
                  {completed ? <Check size={14} /> : n}
                </div>
                {n < 4 && (
                  <div
                    className={[
                      "w-8 md:w-12 h-px transition-colors",
                      step > n ? "bg-gold" : "bg-[#2A2A30]",
                    ].join(" ")}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Step content */}
        <div className="bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 md:p-10">
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.section key="step-1" {...motionProps}>
                <header className="mb-6">
                  <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
                    <Sparkles size={14} /> Step 1 — Membership
                  </div>
                  <h2 className="font-serif text-xl md:text-2xl text-primary">
                    Choose your tier
                  </h2>
                  <p className="text-secondary text-sm mt-1">
                    You can change tiers later from your account settings.
                  </p>
                </header>

                {foundingWindowOpen && (
                  <div className="mb-6 rounded-xl border border-gold/30 bg-gold/5 p-4 md:p-5">
                    <div className="flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
                      <Crown size={14} /> Founding Member pricing
                    </div>
                    <p className="text-sm text-secondary mb-3">
                      Join before our Q3 2027 launch and lock in founding
                      rates on Reserve, Private Vault, and Estate — price
                      held for life with continuous membership.
                    </p>
                    <ul className="grid gap-1.5">
                      {FOUNDING_BENEFITS.map((b) => (
                        <li
                          key={b}
                          className="flex items-start gap-2 text-xs text-secondary"
                        >
                          <Check
                            size={12}
                            className="text-gold shrink-0 mt-0.5"
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid gap-3 md:gap-4">
                  {SELF_SERVE_TIERS.map((opt) => {
                    const selected = tier === opt.dbTier;
                    const showFounding =
                      foundingWindowOpen && foundingSavingsUsd(opt) > 0;
                    return (
                      <button
                        type="button"
                        key={opt.slug}
                        onClick={() => opt.dbTier && setTier(opt.dbTier)}
                        aria-pressed={selected}
                        className={[
                          "text-left rounded-xl border p-4 md:p-5 transition-colors",
                          selected
                            ? "border-gold bg-gold/5"
                            : "border-[#2A2A30] hover:border-[#3A3A44]",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <span className="font-serif text-lg text-primary block">
                              {opt.name}
                            </span>
                            {showFounding ? (
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-gold text-sm font-semibold">
                                  {opt.foundingDisplay}
                                </span>
                                <span className="text-muted text-xs line-through">
                                  {opt.priceDisplay}
                                </span>
                                <span className="text-[11px] text-gold bg-gold/10 border border-gold/20 rounded-full px-2 py-0.5">
                                  Save ${foundingSavingsUsd(opt)}/mo
                                </span>
                              </div>
                            ) : (
                              <span className="text-gold text-sm">
                                {opt.priceDisplay}
                              </span>
                            )}
                          </div>
                          <span
                            className={[
                              "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1",
                              selected
                                ? "border-gold bg-gold text-caveau-black"
                                : "border-[#3A3A44]",
                            ].join(" ")}
                          >
                            {selected && <Check size={12} />}
                          </span>
                        </div>
                        <p className="text-secondary text-sm">
                          {opt.description}
                        </p>
                        <ul className="mt-3 space-y-1.5">
                          {opt.includedServices.map((s) => (
                            <li
                              key={s}
                              className="flex items-start gap-2 text-xs text-secondary"
                            >
                              <Check
                                size={12}
                                className="text-gold shrink-0 mt-0.5"
                              />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                        {opt.hurricaneProtection === "included" && (
                          <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-gold bg-gold/10 border border-gold/20 rounded-full px-2.5 py-1">
                            <ShieldCheck size={11} />
                            Hurricane Protection included
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={handleTierContinue}
                    disabled={isPending || submitted}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Continue <ChevronRight size={16} />
                  </button>
                </div>
              </motion.section>
            )}

            {step === 2 && (
              <motion.section key="step-2" {...motionProps}>
                <header className="mb-6">
                  <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
                    <Lock size={14} /> Step 2 — Reserve a locker
                  </div>
                  <h2 className="font-serif text-xl md:text-2xl text-primary">
                    Your private storage
                  </h2>
                  <p className="text-secondary text-sm mt-1">
                    We&rsquo;ll set aside a 32-bottle locker at {facilityName}.
                    Climate-controlled, monitored 24/7 by our Sentinel system.
                  </p>
                </header>

                <div className="rounded-xl border border-[#2A2A30] bg-[#1C1C20] p-5 md:p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold">
                    <Lock size={20} />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted">
                      Reserving
                    </div>
                    <div className="font-serif text-lg text-primary">
                      Locker — {facilityName}
                    </div>
                    <div className="text-secondary text-sm">
                      32 climate-controlled slots
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    disabled={isPending || submitted}
                    className="text-secondary hover:text-primary text-sm transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleReserveLocker}
                    disabled={isPending || submitted}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? "Reserving..." : "Reserve locker"}
                    <ChevronRight size={16} />
                  </button>
                </div>
              </motion.section>
            )}

            {step === 3 && (
              <motion.section key="step-3" {...motionProps}>
                <header className="mb-6">
                  <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
                    <Cpu size={14} /> Step 3 — Sentinel devices
                  </div>
                  <h2 className="font-serif text-xl md:text-2xl text-primary">
                    {hasBundle
                      ? installedDevices.length > 0
                        ? "Your Sentinels are live"
                        : `Your ${tierSpec.name} membership includes ${bundleCopy(tierSpec.bundledSentinels, tierSpec.bundledBottleProbes)}`
                      : "Your locker is monitored 24/7"}
                  </h2>
                  <p className="text-secondary text-sm mt-1">
                    {hasBundle
                      ? installedDevices.length > 0
                        ? "Installed in your locker and streaming temperature, humidity, vibration, and light now."
                        : reservedLocker
                          ? `We'll install them in Locker #${reservedLocker.lockerNumber}, Zone ${reservedLocker.zone} and start streaming readings immediately.`
                          : "We'll install them in your locker and start streaming readings immediately."
                      : "Every Caveau locker ships with built-in monitoring. Add a Sentinel unit later to get probe-level detail and Bottle Probe tracking."}
                  </p>
                </header>

                {hasBundle && installedDevices.length === 0 && (
                  <>
                    <div className="rounded-xl border border-[#2A2A30] bg-[#1C1C20] p-5 md:p-6 grid gap-3">
                      {tierSpec.bundledSentinels > 0 && (
                        <DeviceBundleRow
                          icon="sensor"
                          title={`${tierSpec.bundledSentinels} × Sentinel locker sensor${tierSpec.bundledSentinels === 1 ? "" : "s"}`}
                          blurb="Temperature, humidity, vibration, and light monitoring with WiFi + LTE-M fallback."
                        />
                      )}
                      {tierSpec.bundledBottleProbes > 0 && (
                        <DeviceBundleRow
                          icon="probe"
                          title={`${tierSpec.bundledBottleProbes} × Bottle Probe`}
                          blurb="Pair with a specific grand cru for bottle-level telemetry. Pair to a wine anytime from your settings."
                        />
                      )}
                    </div>

                    <div className="mt-8 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={isPending || submitted}
                        className="text-secondary hover:text-primary text-sm transition-colors"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={handleInstallDevices}
                        disabled={isPending || submitted}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isPending ? "Installing..." : "Install my devices"}
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                )}

                {hasBundle && installedDevices.length > 0 && (
                  <>
                    <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 md:p-6 grid gap-3">
                      {installedDevices.map((d) => (
                        <div
                          key={d.serialNumber}
                          className="flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-gold">
                            {d.model === SentinelModel.bottle_probe ? (
                              <Droplet size={16} />
                            ) : (
                              <Cpu size={16} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs uppercase tracking-wider text-muted">
                              {d.model === SentinelModel.bottle_probe
                                ? "Bottle Probe"
                                : "Sentinel (locker)"}
                            </div>
                            <div className="text-primary font-mono tabular-nums text-sm truncate">
                              {d.serialNumber}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-ok bg-ok/10 border border-ok/30 rounded-full px-2 py-0.5 shrink-0">
                            <Wifi size={11} />
                            Online
                          </span>
                        </div>
                      ))}
                    </div>

                    {installShortage > 0 && (
                      <p className="mt-4 text-xs text-secondary">
                        {installShortage} device
                        {installShortage === 1 ? "" : "s"} from your bundle
                        {installShortage === 1 ? " is" : " are"} shipping this
                        week — you&rsquo;ll see{" "}
                        {installShortage === 1 ? "it" : "them"} in your
                        settings as soon as we provision them.
                      </p>
                    )}

                    <div className="mt-8 flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3">
                      <button
                        type="button"
                        onClick={handleContinueFromDevices}
                        disabled={isPending || submitted}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Continue <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                )}

                {!hasBundle && (
                  <>
                    <div className="rounded-xl border border-[#2A2A30] bg-[#1C1C20] p-5 md:p-6">
                      <p className="text-sm text-secondary mb-4">
                        Collector tier includes facility-wide Sentinel
                        monitoring on every locker. For probe-level
                        telemetry or a Bottle Probe paired to a specific
                        bottle, upgrade any time:
                      </p>
                      <ul className="grid gap-2">
                        <UpsellRow
                          name="Reserve"
                          include="1 Sentinel"
                          price="$149/mo"
                        />
                        <UpsellRow
                          name="Private Vault"
                          include="2 Sentinels"
                          price="$349/mo"
                        />
                        <UpsellRow
                          name="Estate"
                          include="2 Sentinels + Bottle Probe"
                          price="$999/mo"
                        />
                      </ul>
                    </div>

                    <div className="mt-8 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={isPending || submitted}
                        className="text-secondary hover:text-primary text-sm transition-colors"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={handleContinueFromDevices}
                        disabled={isPending || submitted}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Continue <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                )}
              </motion.section>
            )}

            {step === 4 && (
              <motion.section key="step-4" {...motionProps}>
                <header className="mb-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-wider mb-2">
                        <Wine size={14} /> Step 4 — Your first bottle
                      </div>
                      <h2 className="font-serif text-xl md:text-2xl text-primary">
                        Add a wine to your cellar
                      </h2>
                      <p className="text-secondary text-sm mt-1">
                        {reservedLocker
                          ? `Locker #${reservedLocker.lockerNumber}, Zone ${reservedLocker.zone} is ready. Your first bottle takes slot 1.`
                          : "Your locker is ready. Your first bottle takes slot 1."}
                      </p>
                    </div>
                    {/* Lets the user revisit tier selection without having to
                        restart. The reserved locker stays in place — only
                        tier is mutable from this back-link. */}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setStep(1);
                      }}
                      disabled={isPending || submitted}
                      className="shrink-0 text-xs text-secondary hover:text-gold transition-colors disabled:opacity-50"
                    >
                      Change tier
                    </button>
                  </div>
                </header>

                <form action={handleAddWine} className="grid gap-4">
                  <div>
                    <label
                      htmlFor="name"
                      className="block text-xs text-muted uppercase tracking-wider mb-2"
                    >
                      Wine name
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      maxLength={500}
                      placeholder="Château Margaux"
                      className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="vintage"
                        className="block text-xs text-muted uppercase tracking-wider mb-2"
                      >
                        Vintage
                      </label>
                      <input
                        id="vintage"
                        name="vintage"
                        type="number"
                        required
                        min={1800}
                        max={new Date().getFullYear() + 1}
                        placeholder="2018"
                        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="region"
                        className="block text-xs text-muted uppercase tracking-wider mb-2"
                      >
                        Region
                      </label>
                      <input
                        id="region"
                        name="region"
                        type="text"
                        required
                        placeholder="Bordeaux"
                        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="varietal"
                        className="block text-xs text-muted uppercase tracking-wider mb-2"
                      >
                        Varietal
                      </label>
                      <input
                        id="varietal"
                        name="varietal"
                        type="text"
                        required
                        placeholder="Cabernet Sauvignon"
                        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="producer"
                        className="block text-xs text-muted uppercase tracking-wider mb-2"
                      >
                        Producer
                      </label>
                      <input
                        id="producer"
                        name="producer"
                        type="text"
                        required
                        placeholder="Château Margaux"
                        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="purchasePrice"
                      className="block text-xs text-muted uppercase tracking-wider mb-2"
                    >
                      Purchase price (USD)
                    </label>
                    <input
                      id="purchasePrice"
                      name="purchasePrice"
                      type="number"
                      required
                      min={0}
                      step={0.01}
                      placeholder="950.00"
                      className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
                    />
                  </div>

                  <div className="mt-4 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleSkipWine}
                      disabled={isPending || submitted}
                      className="text-secondary hover:text-primary text-sm transition-colors"
                    >
                      Skip — I&rsquo;ll add bottles later
                    </button>
                    <button
                      type="submit"
                      disabled={isPending || submitted}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending ? "Adding..." : "Add bottle & finish"}
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </form>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function bundleCopy(sentinels: number, probes: number): string {
  const parts: string[] = [];
  if (sentinels > 0) {
    parts.push(`${sentinels} Sentinel${sentinels === 1 ? "" : "s"}`);
  }
  if (probes > 0) {
    parts.push(`${probes} Bottle Probe${probes === 1 ? "" : "s"}`);
  }
  return parts.join(" + ");
}

function DeviceBundleRow({
  icon,
  title,
  blurb,
}: {
  icon: "sensor" | "probe";
  title: string;
  blurb: string;
}) {
  const Icon = icon === "probe" ? Droplet : Cpu;
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-gold shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-primary text-sm font-medium">{title}</div>
        <div className="text-xs text-muted mt-0.5">{blurb}</div>
      </div>
    </div>
  );
}

function UpsellRow({
  name,
  include,
  price,
}: {
  name: string;
  include: string;
  price: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="text-primary">{name}</span>
      <span className="text-secondary text-xs">{include}</span>
      <span className="text-gold text-xs tabular-nums">{price}</span>
    </li>
  );
}
