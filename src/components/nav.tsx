"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wine,
  Lock,
  Activity,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/collection", label: "Collection", icon: Wine },
  { href: "/locker", label: "Locker", icon: Lock },
  { href: "/sentinel", label: "Sentinel", icon: Activity },
];

export default function Nav() {
  const pathname = usePathname();

  // Hide nav on certificate pages (standalone printable layout)
  if (pathname.startsWith("/certificate")) return null;

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

        {/* Nav links */}
        <nav className="flex-1 px-3 mt-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
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
            Robert Saenz
          </p>
          <p className="text-xs text-gold-text">Black Tier</p>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[#2A2A30]/50 bg-caveau-charcoal/90 backdrop-blur-xl z-40">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 transition-colors duration-200 ${
                  isActive ? "text-gold" : "text-muted"
                }`}
              >
                <item.icon size={20} strokeWidth={1.8} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
