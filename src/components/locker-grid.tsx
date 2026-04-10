"use client";

import { useState } from "react";
import Link from "next/link";
import { Wine, X, Calendar, MapPin, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/** Varietal → accent color for the slot border/glow */
function varietalColor(varietal: string): string {
  const v = varietal.toLowerCase();
  if (v.includes("cabernet")) return "#C23152"; // burgundy
  if (v.includes("pinot noir")) return "#9B2335";
  if (v.includes("merlot")) return "#8B2252";
  if (v.includes("syrah") || v.includes("shiraz")) return "#6B2D5B";
  if (v.includes("chardonnay")) return "#FFD166"; // gold
  if (v.includes("sauvignon blanc")) return "#A8D8A8";
  if (v.includes("riesling")) return "#60A5FA";
  if (v.includes("champagne") || v.includes("sparkling")) return "#F0E68C";
  return "#C23152"; // default burgundy
}

export interface SlotData {
  id: string;
  slotPosition: number;
  wine: {
    id: string;
    name: string;
    vintage: number;
    region: string;
    varietal: string;
    currentValue: string; // serialized Decimal
  } | null;
  dateStored: string | null; // serialized Date
}

interface LockerGridProps {
  slots: SlotData[];
}

function daysStored(dateStored: string | null): number {
  if (!dateStored) return 0;
  const stored = new Date(dateStored);
  const now = new Date();
  return Math.floor((now.getTime() - stored.getTime()) / (1000 * 60 * 60 * 24));
}

export default function LockerGrid({ slots }: LockerGridProps) {
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null);

  // Build a map of slotPosition → SlotData for the 32 slots
  const slotMap = new Map<number, SlotData>();
  for (const slot of slots) {
    slotMap.set(slot.slotPosition, slot);
  }

  return (
    <div className="relative">
      {/* 4x8 grid */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {Array.from({ length: 32 }, (_, i) => {
          const position = i + 1;
          const slot = slotMap.get(position);
          const isOccupied = slot?.wine != null;
          const color = isOccupied ? varietalColor(slot!.wine!.varietal) : undefined;

          return (
            <button
              key={position}
              onClick={() => {
                if (isOccupied && slot) setSelectedSlot(slot);
              }}
              className={`
                aspect-square rounded-xl flex flex-col items-center justify-center p-1.5
                transition-all duration-200 text-center
                ${
                  isOccupied
                    ? "bg-[#141416]/80 backdrop-blur-xl border-2 cursor-pointer hover:scale-105 hover:shadow-lg"
                    : "border-2 border-dashed border-[#2A2A30]/50 bg-[#141416]/30 cursor-default"
                }
              `}
              style={
                isOccupied
                  ? { borderColor: color, boxShadow: `0 0 12px ${color}20` }
                  : undefined
              }
              disabled={!isOccupied}
            >
              {isOccupied ? (
                <>
                  <Wine
                    size={16}
                    strokeWidth={1.5}
                    style={{ color }}
                    className="mb-0.5 shrink-0"
                  />
                  <span className="text-[9px] sm:text-[10px] text-primary font-medium leading-tight line-clamp-2">
                    {slot!.wine!.name.length > 16
                      ? slot!.wine!.name.slice(0, 14) + "..."
                      : slot!.wine!.name}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted">{position}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Slide-in detail panel */}
      {selectedSlot && selectedSlot.wine && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSelectedSlot(null)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-caveau-charcoal border-l border-[#2A2A30]/50 z-50 overflow-y-auto animate-slide-in">
            <div className="p-6">
              {/* Close button */}
              <button
                onClick={() => setSelectedSlot(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-[#1C1C20] flex items-center justify-center text-muted hover:text-primary transition-colors"
              >
                <X size={16} />
              </button>

              {/* Slot number badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/10 text-gold text-xs font-medium mb-6">
                Slot {selectedSlot.slotPosition}
              </div>

              {/* Wine name */}
              <h2 className="font-serif text-xl text-primary mb-1">
                {selectedSlot.wine.name}
              </h2>
              <p className="text-secondary text-sm mb-6">
                {selectedSlot.wine.vintage} {selectedSlot.wine.varietal}
              </p>

              {/* Details */}
              <div className="space-y-4">
                <div className="glass-card p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center">
                    <MapPin size={16} className="text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted">Region</p>
                    <p className="text-sm text-primary font-medium">
                      {selectedSlot.wine.region}
                    </p>
                  </div>
                </div>

                <div className="glass-card p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center">
                    <DollarSign size={16} className="text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted">Current Value</p>
                    <p className="text-sm text-primary font-medium">
                      {formatCurrency(selectedSlot.wine.currentValue)}
                    </p>
                  </div>
                </div>

                <div className="glass-card p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center">
                    <Calendar size={16} className="text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-muted">Days Stored</p>
                    <p className="text-sm text-primary font-medium">
                      {daysStored(selectedSlot.dateStored)} days
                    </p>
                  </div>
                </div>
              </div>

              {/* Link to wine detail */}
              <Link
                href={`/wine/${selectedSlot.wine.id}`}
                className="btn-gold w-full mt-6 flex items-center justify-center gap-2 text-sm"
              >
                <Wine size={16} />
                View Wine Detail
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
