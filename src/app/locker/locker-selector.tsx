"use client";

import { useMemo, useState } from "react";
import { Lock, MapPin, Plus, Search, ShieldCheck, X } from "lucide-react";
import LockerGrid, { type SlotData, type UnassignedWine } from "@/components/locker-grid";
import { FacilityPill } from "@/components/facility-context";
import type {
  ScanUploadUrlResult,
  ScanWineLabelResult,
} from "@/app/collection/label-scan-actions";

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
  s3Configured: boolean;
  visionConfigured: boolean;
  requestScanUploadUrlAction: (
    contentType: string,
    contentLength: number,
  ) => Promise<ScanUploadUrlResult>;
  scanWineLabelAction: (key: string) => Promise<ScanWineLabelResult>;
}

interface AssignedBottleOption {
  id: string;
  label: string;
  lockerIndex: number;
  lockerNumber: number;
  slotPosition: number;
  row: number;
  column: number;
  searchText: string;
}

function slotLocation(slotPosition: number) {
  return {
    row: Math.ceil(slotPosition / 8),
    column: ((slotPosition - 1) % 8) + 1,
  };
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function LockerSelector({
  lockers,
  unassignedWines,
  s3Configured,
  visionConfigured,
  requestScanUploadUrlAction,
  scanWineLabelAction,
}: LockerSelectorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [addTrigger, setAddTrigger] = useState(0);
  const [locatedWineId, setLocatedWineId] = useState<string | null>(null);
  const [locatorQuery, setLocatorQuery] = useState("");
  const [locatorOpen, setLocatorOpen] = useState(false);
  const locker = lockers[activeIndex] ?? lockers[0];

  const assignedBottles = useMemo<AssignedBottleOption[]>(() => {
    return lockers.flatMap((l, lockerIndex) =>
      l.slots.flatMap((slot) => {
        if (!slot.wine) return [];
        const location = slotLocation(slot.slotPosition);
        const label = `${slot.wine.vintage} ${slot.wine.name}`;
        return {
          id: slot.wine.id,
          label,
          lockerIndex,
          lockerNumber: l.lockerNumber,
          slotPosition: slot.slotPosition,
          row: location.row,
          column: location.column,
          searchText: normalizeSearch([
            label,
            slot.wine.region,
            slot.wine.varietal,
            `locker ${l.lockerNumber}`,
            `slot ${slot.slotPosition}`,
            `row ${location.row}`,
          ].join(" ")),
        };
      }),
    );
  }, [lockers]);

  const locatedBottle =
    locatedWineId != null
      ? assignedBottles.find((bottle) => bottle.id === locatedWineId) ?? null
      : null;

  const locatorResults = useMemo(() => {
    const query = normalizeSearch(locatorQuery.trim());
    const matches = query
      ? assignedBottles.filter((bottle) => bottle.searchText.includes(query))
      : assignedBottles;
    return matches.slice(0, 8);
  }, [assignedBottles, locatorQuery]);

  if (!locker) {
    return (
      <div className="glass-card p-8 text-center">
        <h1 className="font-serif text-2xl text-primary mb-2">No locker yet</h1>
        <p className="text-secondary text-sm">
          Reserve a locker to start storing wines.
        </p>
      </div>
    );
  }

  const hasEmptySlot = locker.slots.some((s) => !s.wine);

  function clearLocator() {
    setLocatedWineId(null);
    setLocatorQuery("");
    setLocatorOpen(false);
  }

  function selectBottle(bottle: AssignedBottleOption) {
    setLocatedWineId(bottle.id);
    setLocatorQuery(bottle.label);
    setActiveIndex(bottle.lockerIndex);
    setLocatorOpen(false);
  }

  function selectLocker(index: number) {
    setActiveIndex(index);
    clearLocator();
  }

  return (
    <>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl text-primary">
              My Locker
            </h1>
            <p className="text-secondary text-sm mt-1">
              Visual map of your wine storage
            </p>
          </div>
          <FacilityPill />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Locker tabs — only show if multiple lockers */}
          {lockers.length > 1 && (
            <div className="flex gap-2" role="tablist" aria-label="Locker selector">
              {lockers.map((l, i) => (
                <button
                  key={l.id}
                  role="tab"
                  aria-selected={i === activeIndex}
                  onClick={() => selectLocker(i)}
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

          {/* Add Wine button */}
          <button
            onClick={() => setAddTrigger((n) => n + 1)}
            disabled={!hasEmptySlot}
            title={hasEmptySlot ? "Add a new wine to this locker" : "Locker is full — remove a wine first"}
            aria-label="Add wine to this locker"
            className="btn-gold flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            Add Wine
          </button>
        </div>
      </div>

      {/* Locker info header */}
      <div className="glass-card p-5 mb-6 relative z-20">
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

        {assignedBottles.length > 0 && (
          <div className="pt-4 mt-4 border-t border-[#2A2A30]/50">
            <label
              htmlFor="locker-bottle-locator"
              className="text-[10px] uppercase tracking-wider text-muted mb-2 block"
            >
              Bottle locator
            </label>
            <div
              className="relative z-30"
              onBlur={(e) => {
                const currentTarget = e.currentTarget;
                window.setTimeout(() => {
                  if (!currentTarget.contains(document.activeElement)) {
                    setLocatorOpen(false);
                  }
                }, 0);
              }}
            >
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                id="locker-bottle-locator"
                type="text"
                value={locatorQuery}
                onFocus={() => setLocatorOpen(true)}
                onChange={(e) => {
                  setLocatorQuery(e.target.value);
                  setLocatedWineId(null);
                  setLocatorOpen(true);
                }}
                placeholder="Search stored bottles..."
                className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-9 pr-10 py-2.5 min-h-[44px] text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
              {locatorQuery && (
                <button
                  type="button"
                  onClick={clearLocator}
                  aria-label="Clear bottle locator"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-[#141416]"
                >
                  <X size={14} />
                </button>
              )}

              {locatorOpen && !locatedBottle && (
                <div className="absolute z-50 left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#2A2A30] bg-[#141416] shadow-2xl p-1">
                  {locatorResults.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted">
                      No stored bottles found
                    </p>
                  ) : (
                    locatorResults.map((bottle) => (
                      <button
                        key={`${bottle.id}-${bottle.lockerNumber}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectBottle(bottle);
                        }}
                        onClick={() => selectBottle(bottle)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gold/5 focus:bg-gold/5 transition-colors"
                      >
                        <p className="text-sm text-primary truncate">
                          {bottle.label}
                        </p>
                        <p className="text-xs text-muted">
                          Locker #{bottle.lockerNumber} - Row {bottle.row},
                          Slot {bottle.column}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {locatedBottle && (
              <div className="mt-3 rounded-xl bg-gold/10 border border-gold/30 p-3 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-gold mb-1">
                    Located
                  </p>
                  <p className="text-sm text-primary font-medium truncate">
                    {locatedBottle.label}
                  </p>
                  <p className="text-xs text-secondary">
                    Locker #{locatedBottle.lockerNumber} - Row{" "}
                    {locatedBottle.row}, Slot {locatedBottle.column} (position{" "}
                    {locatedBottle.slotPosition})
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
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
      <LockerGrid
        lockerNumber={locker.lockerNumber}
        slots={locker.slots}
        unassignedWines={unassignedWines}
        addTrigger={addTrigger}
        locatedWineId={locatedWineId}
        s3Configured={s3Configured}
        visionConfigured={visionConfigured}
        requestScanUploadUrlAction={requestScanUploadUrlAction}
        scanWineLabelAction={scanWineLabelAction}
      />
    </>
  );
}
