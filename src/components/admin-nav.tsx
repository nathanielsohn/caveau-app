"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Lock,
  Bell,
  CalendarDays,
  FileInput,
  LogOut,
  ArrowLeft,
} from "lucide-react";

const adminNavItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/lockers", label: "Lockers", icon: Lock },
  { href: "/admin/alerts", label: "Alerts", icon: Bell },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/migrations", label: "Migrations", icon: FileInput },
];

export default function AdminNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <>
      {/* Desktop sidebar — mirrors the member nav width so the root layout's
          md:ml-56 offset still lands content correctly. */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-56 flex-col border-r border-[#2A2A30]/50 bg-caveau-charcoal/80 backdrop-blur-xl z-40">
        <div className="px-6 py-6">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="text-gold text-2xl">◈</span>
            <span className="font-serif text-xl text-primary tracking-wide">
              Caveau
            </span>
          </Link>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-gold-text">
            Admin
          </p>
        </div>

        <nav className="flex-1 px-3 mt-2">
          {adminNavItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
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

          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl mt-3 text-sm text-muted hover:text-primary hover:bg-[#1C1C20]/60 transition-colors"
          >
            <ArrowLeft size={16} strokeWidth={1.8} />
            Member view
          </Link>
        </nav>

        <div className="px-6 py-5 border-t border-[#2A2A30]/50">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">
            Signed in
          </p>
          <p className="text-sm text-primary font-medium truncate">
            {session?.user?.name || "—"}
          </p>
          <p className="text-xs text-gold-text">Admin</p>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-primary mt-3 transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header — compact summary + sign out */}
      <div className="md:hidden flex items-center justify-between px-4 pt-3 pb-1 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-gold-text uppercase tracking-widest">
            Admin
          </p>
          <p className="text-sm text-primary font-medium truncate">
            {session?.user?.name || "—"}
          </p>
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

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[#2A2A30]/50 bg-caveau-charcoal/90 backdrop-blur-xl z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around h-16">
          {adminNavItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
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
                <span className="text-[10px] sm:text-xs font-medium tracking-wide">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
