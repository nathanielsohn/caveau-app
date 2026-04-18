"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Wine,
  Lock,
  Activity,
  LogOut,
  Settings as SettingsIcon,
  Building2,
  ShieldCheck,
  LineChart,
  Sparkles,
  CalendarDays,
  MoreHorizontal,
  X,
} from "lucide-react";
import { setCurrentFacility } from "@/app/facility-actions";

// Mobile bottom bar shows the 4 primary items + a More button that opens a
// sheet with the rest; desktop sidebar shows everything as a flat list.
const primaryNavItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/collection", label: "Collection", icon: Wine },
  { href: "/portfolio", label: "Portfolio", icon: LineChart },
  { href: "/advisor", label: "AI Advisor", icon: Sparkles },
];

const secondaryNavItems = [
  { href: "/locker", label: "Locker", icon: Lock },
  { href: "/sentinel", label: "Sentinel", icon: Activity },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/facility", label: "Facility", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const navItems = [...primaryNavItems, ...secondaryNavItems];

interface FacilityOption {
  id: string;
  name: string;
  location: string;
}

interface NavProps {
  facilities: FacilityOption[];
  currentFacilityId: string | null;
  /** Resolved server-side so the member line doesn't flash "—" before
   *  the client session hydrates. */
  displayName: string | null;
  /** Resolved server-side so the tier line doesn't pop in after hydration. */
  tier: string | null;
}

export default function Nav({
  facilities,
  currentFacilityId,
  displayName: serverDisplayName,
  tier: serverTier,
}: NavProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isPending, startTransition] = useTransition();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet whenever the route changes so a link tap dismisses it.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const hydrated = status === "authenticated";
  const displayName = hydrated
    ? session?.user?.name ?? serverDisplayName
    : serverDisplayName;
  const tier = hydrated ? session?.user?.tier ?? serverTier : serverTier;

  const handleFacilityChange = (id: string) => {
    if (id === currentFacilityId) return;
    startTransition(async () => {
      const result = await setCurrentFacility(id);
      if (!result.ok) return;
      // Hard navigate to the current path so client-side filter/sort state in
      // collection-client and locker-grid resets — `router.refresh()` alone
      // re-runs server components but leaves React state in place, which
      // briefly applies one facility's filters to another facility's data.
      window.location.href = pathname;
    });
  };

  // Hide nav on report, certificate (legacy redirect), verify, public handoff
  // bundles, auth pages, and the admin panel (which has its own admin-nav).
  // Note: `/handoff` (no slash) is the member's authenticated list page and
  // should keep the nav.
  if (
    pathname.startsWith("/report") ||
    pathname.startsWith("/certificate") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/handoff/") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/admin")
  )
    return null;

  const tierLabel = tier
    ? tier.charAt(0).toUpperCase() + tier.slice(1) + " Tier"
    : "";

  // Facility switcher only makes sense on pages whose data is facility-scoped.
  // Dashboard aggregates across all facilities; settings is account-wide.
  const showFacilitySwitcher =
    pathname.startsWith("/collection") ||
    pathname.startsWith("/locker") ||
    pathname.startsWith("/sentinel") ||
    pathname.startsWith("/facility");

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-56 flex-col border-r border-[#2A2A30]/50 bg-caveau-charcoal/80 backdrop-blur-xl z-40">
        {/* Logo */}
        <div className="px-6 py-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-gold text-2xl">◈</span>
            <span className="font-serif text-xl text-primary tracking-wide">
              Caveau
            </span>
          </Link>
        </div>

        {/* Facility switcher — only if the member belongs to more than one */}
        {facilities.length > 1 && showFacilitySwitcher && (
          <div className="px-4 mb-3">
            <label
              htmlFor="facility-switcher"
              className="text-[10px] uppercase tracking-wider text-muted flex items-center gap-1.5 mb-1.5"
            >
              <Building2 size={11} strokeWidth={2} />
              Facility
            </label>
            <div className="relative">
              <select
                id="facility-switcher"
                value={currentFacilityId ?? ""}
                onChange={(e) => handleFacilityChange(e.target.value)}
                disabled={isPending}
                className="w-full appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2 pr-8 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40 disabled:opacity-50 cursor-pointer"
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">
                ▾
              </span>
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 px-3 mt-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? "bg-gold/10 text-gold"
                    : "text-secondary hover:text-primary hover:bg-[#1C1C20]/60"
                }`}
              >
                <item.icon size={18} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Member info at bottom */}
        <div className="px-6 py-5 border-t border-[#2A2A30]/50">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">
            Member
          </p>
          <p className="text-sm text-primary font-medium truncate">
            {displayName || "—"}
          </p>
          <p className="text-xs text-gold-text">{tierLabel}</p>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-primary mt-3 transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile member + sign out — sits in flow at the top of every
          non-auth page so mobile users can sign out without chasing the
          desktop sidebar. The settings tab in the bottom bar is scoped to
          notification prefs, so that's not the right home for this. */}
      <div className="md:hidden flex items-center justify-between px-4 pt-3 pb-1 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Member
          </p>
          <p className="text-sm text-primary font-medium truncate">
            {displayName || "—"}
          </p>
          {tierLabel && (
            <p className="text-[11px] text-gold-text">{tierLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          aria-label="Sign out"
          className="flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs text-secondary hover:text-primary hover:bg-[#1C1C20]/60 active:bg-[#1C1C20] transition-colors flex-shrink-0"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>

      {/* Mobile facility switcher — sits in flow above page content on facility-scoped routes. */}
      {facilities.length > 1 && showFacilitySwitcher && (
        <div className="md:hidden px-4 pt-3 pb-1">
          <label
            htmlFor="facility-switcher-mobile"
            className="text-[10px] uppercase tracking-wider text-muted flex items-center gap-1.5 mb-1.5"
          >
            <Building2 size={11} strokeWidth={2} />
            Facility
          </label>
          <div className="relative">
            <select
              id="facility-switcher-mobile"
              value={currentFacilityId ?? ""}
              onChange={(e) => handleFacilityChange(e.target.value)}
              disabled={isPending}
              className="w-full appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2 pr-8 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40 disabled:opacity-50 cursor-pointer"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">
              ▾
            </span>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar — pads for the iPhone home indicator via safe-area-inset. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[#2A2A30]/50 bg-caveau-charcoal/90 backdrop-blur-xl z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around h-16">
          {primaryNavItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1.5 transition-colors duration-200 ${
                  isActive ? "text-gold" : "text-muted"
                }`}
              >
                <item.icon size={20} strokeWidth={1.8} />
                <span className="text-[10px] sm:text-xs font-medium tracking-wide">{item.label}</span>
              </Link>
            );
          })}
          {(() => {
            const moreActive = secondaryNavItems.some(
              (item) =>
                pathname === item.href || pathname.startsWith(item.href + "/")
            );
            return (
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="More navigation"
                aria-expanded={moreOpen}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1.5 transition-colors duration-200 ${
                  moreActive || moreOpen ? "text-gold" : "text-muted"
                }`}
              >
                <MoreHorizontal size={20} strokeWidth={1.8} />
                <span className="text-[10px] sm:text-xs font-medium tracking-wide">
                  More
                </span>
              </button>
            );
          })()}
        </div>
      </nav>

      {/* Mobile "More" sheet — slides up with the secondary routes. */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More navigation">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-caveau-charcoal/95 backdrop-blur-xl border-t border-[#2A2A30]/50 rounded-t-2xl px-3 pt-3 pb-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-xs text-muted uppercase tracking-wider">
                More
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-primary min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex flex-col">
              {secondaryNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? "bg-gold/10 text-gold"
                        : "text-secondary hover:text-primary hover:bg-[#1C1C20]/60"
                    }`}
                  >
                    <item.icon size={18} strokeWidth={1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
