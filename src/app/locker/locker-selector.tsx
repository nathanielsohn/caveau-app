"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import LockerGrid, { type SlotData, type UnassignedWine } from "@/components/locker-grid";

interface LockerData {
  id: string;
  lockerNumber: number;
  zone: string;
  slots: SlotData[];
  occupiedCount: number;
  totalSlots: number;
}

interface LockerSelectorProps {
  lockers: LockerData[];
  unassignedWines: UnassignedWine[];
}

export default function LockerSelector({ lockers, unassignedWines }: LockerSelectorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const locker = lockers[activeIndex];

  return (
    <>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl text-primary">
            My Locker
          </h1>
          <p className="text-secondary text-sm mt-1">
            Visual map of your wine storage
          </p>
        </div>

        {/* Locker tabs — only show if multiple lockers */}
        {lockers.length > 1 && (
          <div className="flex gap-2" role="tablist" aria-label="Locker selector">
            {lockers.map((l, i) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={i === activeIndex}
                onClick={() => setActiveIndex(i)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                  i === activeIndex
                    ? "bg-gold/10 text-gold border border-gold/30"
                    : "bg-[#1C1C20]/60 text-secondary border border-[#2A2A30]/50 hover:text-primary hover:border-gold/20"
                }`}
              >
                Locker #{l.lockerNumber}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Locker info header */}
      <div className="glass-card p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center">
            <Lock size={22} className="text-gold" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-lg text-primary">
                Locker #{locker.lockerNumber}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#1C1C20] text-xs font-medium text-secondary">
                Zone {locker.zone}
              </span>
            </div>
            <p className="text-sm text-secondary mt-0.5">
              <span className="text-gold font-medium">
                {locker.occupiedCount}
              </span>
              /{locker.totalSlots} slots occupied
            </p>
          </div>
          {/* Occupancy bar */}
          <div className="hidden sm:block w-32">
            <div className="h-2 rounded-full bg-[#1C1C20] overflow-hidden">
              <div
                className="h-full rounded-full bg-gold transition-all duration-500"
                style={{
                  width: `${(locker.occupiedCount / locker.totalSlots) * 100}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-muted mt-1 text-right">
              {Math.round((locker.occupiedCount / locker.totalSlots) * 100)}%
              full
            </p>
          </div>
        </div>
      </div>

      {/* Insurance + Grid legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-burgundy bg-[#141416]/80" />
          <span className="text-xs text-muted">Occupied</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-dashed border-[#2A2A30]/50 bg-[#141416]/30" />
          <span className="text-xs text-muted">Empty</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <ShieldCheck size={14} className="text-ok" />
          <span className="text-xs text-ok font-medium">PURE Insurance Verified</span>
        </div>
      </div>

      {/* Locker grid */}
      <LockerGrid slots={locker.slots} unassignedWines={unassignedWines} />
    </>
  );
}
