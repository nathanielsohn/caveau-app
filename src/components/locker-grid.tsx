"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Wine, X, Calendar, MapPin, DollarSign, Search, Plus, Minus, Loader2, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { assignWineToSlot, removeWineFromSlot, addWineAndAssignToSlot } from "@/app/locker/actions";

/** Varietal -> accent color for the slot border/glow */
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

export interface UnassignedWine {
  id: string;
  name: string;
  vintage: number;
  region: string;
  varietal: string;
}

interface LockerGridProps {
  slots: SlotData[];
  unassignedWines: UnassignedWine[];
  /** Incremented by parent to request opening the add-wine form on the first empty slot */
  addTrigger?: number;
}

function daysStored(dateStored: string | null): number {
  if (!dateStored) return 0;
  const stored = new Date(dateStored);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - stored.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Convert hex color to rgba for cross-browser alpha support */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function LockerGrid({ slots, unassignedWines, addTrigger }: LockerGridProps) {
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null);
  const [pickerSlot, setPickerSlot] = useState<SlotData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const addFormRef = useRef<HTMLFormElement>(null);
  const lastHandledTrigger = useRef(0);

  // Build a map of slotPosition -> SlotData for the 32 slots
  const slotMap = useMemo(() => {
    const map = new Map<number, SlotData>();
    for (const slot of slots) {
      map.set(slot.slotPosition, slot);
    }
    return map;
  }, [slots]);

  // Guard against re-firing when slots change (e.g., after assigning a wine) while addTrigger is still the same.
  useEffect(() => {
    if (!addTrigger || addTrigger === lastHandledTrigger.current) return;
    lastHandledTrigger.current = addTrigger;
    const firstEmpty = slots.find((s) => !s.wine);
    if (!firstEmpty) return;
    setPickerSlot(firstEmpty);
    setShowAddForm(true);
    setSearchQuery("");
    setActionError(null);
  }, [addTrigger, slots]);

  // Filter unassigned wines by search query
  const filteredWines = useMemo(() => {
    if (!searchQuery.trim()) return unassignedWines;
    const q = searchQuery.toLowerCase();
    return unassignedWines.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.varietal.toLowerCase().includes(q) ||
        w.region.toLowerCase().includes(q) ||
        w.vintage.toString().includes(q)
    );
  }, [unassignedWines, searchQuery]);

  function handleSlotClick(slot: SlotData | undefined) {
    if (slot?.wine) {
      // Occupied slot — open detail panel
      setSelectedSlot(slot);
    } else if (slot && !slot.wine) {
      // Empty slot — open picker modal (can assign existing or add new)
      setPickerSlot(slot);
      setSearchQuery("");
      setShowAddForm(false);
      setActionError(null);
    }
  }

  function handleAssignWine(wineId: string) {
    if (!pickerSlot) return;
    setActionError(null);
    startTransition(async () => {
      const result = await assignWineToSlot(pickerSlot.id, wineId);
      if (result.error) {
        setActionError(result.error);
      } else {
        setPickerSlot(null);
      }
    });
  }

  function handleAddWineToSlot(formData: FormData) {
    if (!pickerSlot) return;
    setActionError(null);
    startTransition(async () => {
      const result = await addWineAndAssignToSlot(pickerSlot.id, formData);
      if (result.error) {
        setActionError(result.error);
      } else {
        addFormRef.current?.reset();
        setPickerSlot(null);
        setShowAddForm(false);
      }
    });
  }

  function handleRemoveWine() {
    if (!selectedSlot) return;
    setActionError(null);
    startTransition(async () => {
      const result = await removeWineFromSlot(selectedSlot.id);
      if (result.error) {
        setActionError(result.error);
      } else {
        setSelectedSlot(null);
      }
    });
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
          const isEmpty = !isOccupied && slot;

          return (
            <button
              key={position}
              onClick={() => handleSlotClick(slot)}
              aria-label={
                isOccupied
                  ? `Slot ${position}: ${slot!.wine!.name}`
                  : isEmpty
                  ? `Slot ${position}: empty — tap to assign or add wine`
                  : `Slot ${position}: empty`
              }
              className={`
                group aspect-square rounded-xl flex flex-col items-center justify-center p-1.5
                transition-all duration-200 text-center
                ${
                  isOccupied
                    ? "bg-[#141416]/80 backdrop-blur-xl border-2 cursor-pointer hover:scale-105 hover:shadow-lg"
                    : isEmpty
                    ? "border-2 border-dashed border-gold/40 bg-[#141416]/30 cursor-pointer hover:border-gold hover:bg-gold/10 hover:scale-105 hover:shadow-[0_0_16px_rgba(255,209,102,0.25)]"
                    : "border-2 border-dashed border-[#2A2A30]/50 bg-[#141416]/30 cursor-default"
                }
              `}
              style={
                isOccupied
                  ? { borderColor: color, boxShadow: `0 0 12px ${hexToRgba(color!, 0.125)}` }
                  : undefined
              }
              disabled={!isOccupied && !isEmpty}
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
              ) : isEmpty ? (
                <>
                  <Plus
                    size={18}
                    strokeWidth={2}
                    className="text-gold/70 mb-0.5 transition-transform duration-200 group-hover:scale-125 group-hover:text-gold"
                  />
                  <span className="text-[10px] text-gold/60 group-hover:text-gold transition-colors">
                    {position}
                  </span>
                  <span className="text-[8px] text-gold font-medium mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                    Add wine
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted">{position}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Slide-in detail panel (occupied slot) */}
      <AnimatePresence>
        {selectedSlot && selectedSlot.wine && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => { setSelectedSlot(null); setActionError(null); }}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full sm:w-96 bg-caveau-charcoal border-l border-[#2A2A30]/50 z-50 overflow-y-auto"
            >
              <div className="p-6">
                {/* Close button */}
                <button
                  onClick={() => { setSelectedSlot(null); setActionError(null); }}
                  aria-label="Close slot detail"
                  className="absolute top-4 right-4 w-11 h-11 rounded-lg bg-[#1C1C20] flex items-center justify-center text-muted hover:text-primary transition-colors"
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

                {/* Remove from slot button */}
                <button
                  onClick={handleRemoveWine}
                  disabled={isPending}
                  className="w-full mt-3 flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-xl border border-[#F87171]/30 text-[#F87171] hover:bg-[#F87171]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Minus size={16} />
                  )}
                  Remove from Slot
                </button>

                {/* Error message */}
                {actionError && (
                  <p className="mt-3 text-xs text-[#F87171] text-center">{actionError}</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Wine picker modal (empty slot) */}
      <AnimatePresence>
        {pickerSlot && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => { setPickerSlot(null); setActionError(null); }}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-4 bottom-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:max-h-[85vh] z-50 bg-[#141416] border border-[#2A2A30]/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {showAddForm ? (
                <form ref={addFormRef} action={handleAddWineToSlot} className="flex flex-col flex-1 min-h-0">
                  <div className="p-5 border-b border-[#2A2A30]/50 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => { setShowAddForm(false); setActionError(null); }}
                          aria-label="Back to wine list"
                          className="w-9 h-9 rounded-lg bg-[#1C1C20] flex items-center justify-center text-muted hover:text-primary transition-colors"
                        >
                          <ArrowLeft size={14} />
                        </button>
                        <div>
                          <h3 className="font-serif text-lg text-primary">Add New Wine</h3>
                          <p className="text-xs text-secondary mt-0.5">
                            Slot {pickerSlot.slotPosition} — add &amp; assign in one step
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setPickerSlot(null); setShowAddForm(false); setActionError(null); }}
                        aria-label="Close"
                        className="w-9 h-9 rounded-lg bg-[#1C1C20] flex items-center justify-center text-muted hover:text-primary transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4">
                    {actionError && (
                      <div className="p-3 rounded-xl bg-[#F87171]/10 border border-[#F87171]/20 text-[#F87171] text-sm">
                        {actionError}
                      </div>
                    )}
                    <div>
                      <label htmlFor="locker-wine-name" className="block text-sm text-secondary mb-1.5">Wine Name</label>
                      <input id="locker-wine-name" name="name" type="text" required placeholder="e.g. Château Margaux" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="locker-wine-vintage" className="block text-sm text-secondary mb-1.5">Vintage</label>
                        <input id="locker-wine-vintage" name="vintage" type="number" required min={1900} max={2030} placeholder="2020" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="locker-wine-region" className="block text-sm text-secondary mb-1.5">Region</label>
                        <input id="locker-wine-region" name="region" type="text" required placeholder="Bordeaux" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="locker-wine-varietal" className="block text-sm text-secondary mb-1.5">Varietal</label>
                        <input id="locker-wine-varietal" name="varietal" type="text" required placeholder="Cabernet Sauvignon" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="locker-wine-producer" className="block text-sm text-secondary mb-1.5">Producer</label>
                        <input id="locker-wine-producer" name="producer" type="text" required placeholder="Château Margaux" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="locker-wine-price" className="block text-sm text-secondary mb-1.5">Purchase Price (USD)</label>
                      <input id="locker-wine-price" name="purchasePrice" type="number" required min={0} step={0.01} placeholder="250.00" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                    </div>
                  </div>

                  <div className="p-5 border-t border-[#2A2A30]/50 shrink-0">
                    <button type="submit" disabled={isPending} className="btn-gold w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {isPending ? (
                        <><Loader2 size={16} className="animate-spin" /> Adding...</>
                      ) : (
                        <><Plus size={16} /> Add &amp; Assign to Slot</>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Header */}
                  <div className="p-5 border-b border-[#2A2A30]/50 shrink-0">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-serif text-lg text-primary">Assign Wine</h3>
                        <p className="text-xs text-secondary mt-0.5">
                          Slot {pickerSlot.slotPosition} — select a wine or add a new one
                        </p>
                      </div>
                      <button
                        onClick={() => { setPickerSlot(null); setActionError(null); }}
                        aria-label="Close wine picker"
                        className="w-9 h-9 rounded-lg bg-[#1C1C20] flex items-center justify-center text-muted hover:text-primary transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        placeholder="Search wines..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-[#1C1C20] border border-[#2A2A30]/50 rounded-xl text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/40 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Add new wine button */}
                  <div className="px-2 pt-2 shrink-0">
                    <button
                      onClick={() => { setShowAddForm(true); setActionError(null); }}
                      className="w-full text-left p-3 rounded-xl border border-dashed border-gold/30 hover:border-gold/60 hover:bg-gold/5 transition-colors flex items-center gap-3 group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                        <Plus size={16} className="text-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gold font-medium">Add New Wine</p>
                        <p className="text-xs text-secondary">Add to collection &amp; assign to this slot</p>
                      </div>
                    </button>
                  </div>

                  {/* Wine list */}
                  <div className="overflow-y-auto flex-1 p-2">
                    {filteredWines.length === 0 ? (
                      <div className="py-10 text-center">
                        <Wine size={24} className="text-muted mx-auto mb-2" />
                        <p className="text-sm text-muted">
                          {searchQuery ? "No wines match your search" : "No unassigned wines"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredWines.map((wine) => (
                          <button
                            key={wine.id}
                            onClick={() => handleAssignWine(wine.id)}
                            disabled={isPending}
                            className="w-full text-left p-3 rounded-xl hover:bg-gold/5 transition-colors flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: hexToRgba(varietalColor(wine.varietal), 0.15) }}
                            >
                              <Wine
                                size={16}
                                strokeWidth={1.5}
                                style={{ color: varietalColor(wine.varietal) }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-primary font-medium truncate group-hover:text-gold transition-colors">
                                {wine.name}
                              </p>
                              <p className="text-xs text-muted truncate">
                                {wine.vintage} {wine.varietal} &middot; {wine.region}
                              </p>
                            </div>
                            {isPending ? (
                              <Loader2 size={14} className="text-gold animate-spin shrink-0" />
                            ) : (
                              <Plus size={14} className="text-muted group-hover:text-gold transition-colors shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Error message */}
                  {actionError && (
                    <div className="px-5 pb-4 shrink-0">
                      <p className="text-xs text-[#F87171] text-center">{actionError}</p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
