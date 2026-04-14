"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Wine,
  Lock,
  Activity,
  LogOut,
  Settings as SettingsIcon,
  Building2,
} from "lucide-react";
import { setCurrentFacility } from "@/app/facility-actions";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/collection", label: "Collection", icon: Wine },
  { href: "/locker", label: "Locker", icon: Lock },
  { href: "/sentinel", label: "Sentinel", icon: Activity },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

interface FacilityOption {
  id: string;
  name: string;
  location: string;
}

interface NavProps {
  facilities: FacilityOption[];
  currentFacilityId: string | null;
}

export default function Nav({ facilities, currentFacilityId }: NavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();

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

  // Hide nav on certificate, verify, and auth pages
  if (
    pathname.startsWith("/certificate") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/auth")
  )
    return null;

  const tierLabel = session?.user?.tier
    ? session.user.tier.charAt(0).toUpperCase() + session.user.tier.slice(1) + " Tier"
    : "";

  // Facility switcher only makes sense on pages whose data is facility-scoped.
  // Dashboard aggregates across all facilities; settings is account-wide.
  const showFacilitySwitcher =
    pathname.startsWith("/collection") ||
    pathname.startsWith("/locker") ||
    pathname.startsWith("/sentinel");

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
            {session?.user?.name || "—"}
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

      {/* Mobile bottom tab bar — pads for the iPhone home indicator via safe-area-inset. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[#2A2A30]/50 bg-caveau-charcoal/90 backdrop-blur-xl z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
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
        </div>
      </nav>
    </>
  );
}
