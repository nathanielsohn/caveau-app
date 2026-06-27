"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { setCurrentFacility } from "@/app/facility-actions";

interface FacilityOption {
  id: string;
  name: string;
  location: string;
  type: "vault" | "private_location";
  privateLocationKind: string | null;
}

interface FacilityContextValue {
  facilities: FacilityOption[];
  currentFacilityId: string | null;
  switchFacility: (id: string) => void;
  isPending: boolean;
}

const FacilityContext = createContext<FacilityContextValue | null>(null);

export function FacilityProvider({
  facilities,
  currentFacilityId,
  children,
}: {
  facilities: FacilityOption[];
  currentFacilityId: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const switchFacility = (id: string) => {
    if (id === currentFacilityId) return;
    startTransition(async () => {
      const result = await setCurrentFacility(id);
      if (!result.ok) return;
      // Hard navigate so client-side filter/sort state resets — matches
      // the desktop sidebar switcher behavior in nav.tsx.
      window.location.href = pathname;
    });
  };

  return (
    <FacilityContext.Provider
      value={{ facilities, currentFacilityId, switchFacility, isPending }}
    >
      {children}
    </FacilityContext.Provider>
  );
}

/**
 * Compact mobile-only pill that sits next to page titles on facility-scoped
 * pages. Hidden on desktop (the sidebar in nav.tsx has its own switcher) and
 * when the member only belongs to a single facility.
 */
export function FacilityPill() {
  const ctx = useContext(FacilityContext);
  if (!ctx || ctx.facilities.length <= 1) return null;
  const { facilities, currentFacilityId, switchFacility, isPending } = ctx;

  return (
    <div className="relative md:hidden flex-shrink-0">
      <Building2
        size={12}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
      <select
        aria-label="Switch facility"
        value={currentFacilityId ?? ""}
        onChange={(e) => switchFacility(e.target.value)}
        disabled={isPending}
        className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-full pl-7 pr-6 py-1.5 min-h-[32px] text-xs font-medium text-secondary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer disabled:opacity-50 max-w-[160px] truncate"
      >
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.type === "private_location" ? `Private: ${f.name}` : f.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
