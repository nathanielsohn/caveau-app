"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Wine, X, Calendar, MapPin, DollarSign, Search, Plus, Minus, Loader2, ArrowLeft, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { assignWineToSlot, removeWineFromSlot, addWineAndAssignToSlot } from "@/app/locker/actions";
import { showToast } from "@/components/toast";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import ScanLabelButton from "@/components/scan-label-button";
import type {
  ScanUploadUrlResult,
  ScanWineLabelResult,
} from "@/app/collection/label-scan-actions";

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
    drinkWindowStart: number | null;
    drinkWindowEnd: number | null;
  } | null;
  dateStored: string | null; // serialized Date
}

type OccupancyFilter = "all" | "occupied" | "empty";
type DrinkFilter = "all" | "ready" | "aging" | "past" | "none";

/** Mirrors getDrinkStatus in wine-card.tsx */
function drinkStatusKey(start: number | null, end: number | null): "ready" | "aging" | "past" | "none" {
  if (!start && !end) return "none";
  const year = new Date().getUTCFullYear();
  if (end && year > end) return "past";
  if (start && year >= start && (!end || year <= end)) return "ready";
  if (start && year < start) return "aging";
  return "none";
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
  /** Wine label scanner (#24) — passed in from server component. */
  s3Configured: boolean;
  visionConfigured: boolean;
  requestScanUploadUrlAction: (
    contentType: string,
    contentLength: number,
  ) => Promise<ScanUploadUrlResult>;
  scanWineLabelAction: (key: string) => Promise<ScanWineLabelResult>;
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

export default function LockerGrid({
  slots,
  unassignedWines,
  addTrigger,
  s3Configured,
  visionConfigured,
  requestScanUploadUrlAction,
  scanWineLabelAction,
}: LockerGridProps) {
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null);
  const [pickerSlot, setPickerSlot] = useState<SlotData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const addFormRef = useRef<HTMLFormElement>(null);
  const lastHandledTrigger = useRef(0);
  const pickerDialogRef = useRef<HTMLDialogElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const addFormNameRef = useRef<HTMLInputElement>(null);
  // Mirror of pickerSlot for in-flight transitions. If the user opens a
  // different slot while a server action is resolving, the success path
  // must not overwrite the newly-opened slot's state.
  const pickerSlotRef = useRef<SlotData | null>(null);
  useEffect(() => {
    pickerSlotRef.current = pickerSlot;
  }, [pickerSlot]);

  // Scanned-field state for the inline add-wine form. Controlled inputs so a
  // successful scan can pre-fill them. imageKey gets threaded through the
  // server action on submit.
  const [addName, setAddName] = useState("");
  const [addVintage, setAddVintage] = useState("");
  const [addRegion, setAddRegion] = useState("");
  const [addVarietal, setAddVarietal] = useState("");
  const [addProducer, setAddProducer] = useState("");
  const [addImageKey, setAddImageKey] = useState("");

  function resetAddFormState() {
    setAddName("");
    setAddVintage("");
    setAddRegion("");
    setAddVarietal("");
    setAddProducer("");
    setAddImageKey("");
  }

  // Single close path so the scanned imageKey + controlled fields can't leak
  // from one open of the picker into the next.
  function closePicker() {
    setPickerSlot(null);
    setShowAddForm(false);
    setActionError(null);
    addFormRef.current?.reset();
    resetAddFormState();
  }

  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyFilter>("all");
  const [regionFilter, setRegionFilter] = useState("");
  const [varietalFilter, setVarietalFilter] = useState("");
  const [drinkFilter, setDrinkFilter] = useState<DrinkFilter>("all");

  // Any modal sheet open → lock body scroll so iOS doesn't scroll behind it.
  useBodyScrollLock(Boolean(selectedSlot) || Boolean(pickerSlot));

  // Drive the picker <dialog> from pickerSlot state. Native <dialog> gives
  // us Escape + focus trap + backdrop for free; on close the browser
  // restores focus to the slot button that triggered the open.
  useEffect(() => {
    const dialog = pickerDialogRef.current;
    if (!dialog) return;
    if (pickerSlot && !dialog.open) {
      dialog.showModal();
    } else if (!pickerSlot && dialog.open) {
      dialog.close();
    }
  }, [pickerSlot]);

  // On open, pull focus into the right field: the search input for the
  // wine list, or the name input when the add-wine form is showing. Without
  // this the user would have to tab past all 32 slot buttons to reach it.
  useEffect(() => {
    if (!pickerSlot) return;
    const id = requestAnimationFrame(() => {
      if (showAddForm) addFormNameRef.current?.focus();
      else pickerSearchRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [pickerSlot, showAddForm]);

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

  const { regions, varietals } = useMemo(() => {
    const r = new Set<string>();
    const v = new Set<string>();
    for (const s of slots) {
      if (s.wine) {
        r.add(s.wine.region);
        v.add(s.wine.varietal);
      }
    }
    return {
      regions: Array.from(r).sort(),
      varietals: Array.from(v).sort(),
    };
  }, [slots]);

  const hasWineAttributeFilter =
    regionFilter !== "" || varietalFilter !== "" || drinkFilter !== "all";
  const filtersActive =
    occupancyFilter !== "all" || hasWineAttributeFilter;

  function slotMatchesFilters(slot: SlotData | undefined): boolean {
    if (!slot) return false;
    const wine = slot.wine;
    if (!wine) {
      if (hasWineAttributeFilter) return false;
      if (occupancyFilter === "occupied") return false;
      return true;
    }
    if (occupancyFilter === "empty") return false;
    if (regionFilter && wine.region !== regionFilter) return false;
    if (varietalFilter && wine.varietal !== varietalFilter) return false;
    if (drinkFilter !== "all") {
      const key = drinkStatusKey(wine.drinkWindowStart, wine.drinkWindowEnd);
      if (key !== drinkFilter) return false;
    }
    return true;
  }

  const matchCount = useMemo(() => {
    let count = 0;
    for (let i = 1; i <= 32; i++) {
      if (slotMatchesFilters(slotMap.get(i))) count++;
    }
    return count;
    // slotMatchesFilters is a stable inline closure that already captures
    // the four filter values, so we list those explicitly instead of the
    // function reference (which changes every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotMap, occupancyFilter, regionFilter, varietalFilter, drinkFilter]);

  function clearFilters() {
    setOccupancyFilter("all");
    setRegionFilter("");
    setVarietalFilter("");
    setDrinkFilter("all");
  }

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
    // Capture the slot the action was started against. If the user manages
    // to open a different slot before the transition resolves, the success
    // path below must not clobber that newer open.
    const originalPickerSlot = pickerSlot;
    const slotNumber = originalPickerSlot.slotPosition;
    setActionError(null);
    startTransition(async () => {
      const result = await assignWineToSlot(originalPickerSlot.id, wineId);
      if (result.error) {
        setActionError(result.error);
      } else {
        if (pickerSlotRef.current?.id === originalPickerSlot.id) {
          setPickerSlot(null);
        }
        showToast(`Bottle assigned to slot ${slotNumber}`);
      }
    });
  }

  function handleAddWineToSlot(formData: FormData) {
    if (!pickerSlot) return;
    if (addImageKey) formData.set("imageKey", addImageKey);
    const originalPickerSlot = pickerSlot;
    const slotNumber = originalPickerSlot.slotPosition;
    setActionError(null);
    startTransition(async () => {
      const result = await addWineAndAssignToSlot(originalPickerSlot.id, formData);
      if (result.error) {
        setActionError(result.error);
      } else {
        if (pickerSlotRef.current?.id === originalPickerSlot.id) {
          addFormRef.current?.reset();
          resetAddFormState();
          setPickerSlot(null);
          setShowAddForm(false);
        }
        showToast(`Bottle added to slot ${slotNumber}`);
      }
    });
  }

  function handleRemoveWine() {
    if (!selectedSlot) return;
    const slotNumber = selectedSlot.slotPosition;
    setActionError(null);
    startTransition(async () => {
      const result = await removeWineFromSlot(selectedSlot.id);
      if (result.error) {
        setActionError(result.error);
      } else {
        setSelectedSlot(null);
        showToast(`Bottle removed from slot ${slotNumber}`);
      }
    });
  }

  return (
    <div className="relative">
      {/* Filters */}
      <div className="glass-card p-4 mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1 bg-caveau-graphite rounded-xl p-1 border border-[#2A2A30] self-start">
            {(["all", "occupied", "empty"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setOccupancyFilter(opt)}
                className={`px-3 py-2 min-h-[44px] rounded-lg text-xs font-medium transition-colors ${
                  occupancyFilter === opt
                    ? "bg-gold/10 text-gold"
                    : "text-muted hover:text-primary"
                }`}
              >
                {opt === "all" ? "All" : opt === "occupied" ? "Occupied" : "Empty"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                aria-label="Filter by region"
                className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2.5 min-h-[44px] text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="">All Regions</option>
                {regions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={varietalFilter}
                onChange={(e) => setVarietalFilter(e.target.value)}
                aria-label="Filter by varietal"
                className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2.5 min-h-[44px] text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="">All Varietals</option>
                {varietals.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={drinkFilter}
                onChange={(e) => setDrinkFilter(e.target.value as DrinkFilter)}
                aria-label="Filter by drink window"
                className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2.5 min-h-[44px] text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="all">All Drink Status</option>
                <option value="ready">Ready to Drink</option>
                <option value="aging">Aging</option>
                <option value="past">Past Peak</option>
                <option value="none">No Window</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              <span className="text-gold font-medium">{matchCount}</span> of 32 slots match
            </p>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="text-xs text-gold hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4x8 grid. At 375px four cols is edge-to-edge, so we drop to three
          on the narrowest phones, step up to four by 420px, then the full
          eight on sm+ where the panel becomes a side sheet. */}
      <div className="grid grid-cols-3 min-[420px]:grid-cols-4 sm:grid-cols-8 gap-2">
        {Array.from({ length: 32 }, (_, i) => {
          const position = i + 1;
          const slot = slotMap.get(position);
          const isOccupied = slot?.wine != null;
          const color = isOccupied ? varietalColor(slot!.wine!.varietal) : undefined;
          const isEmpty = !isOccupied && slot;
          const matches = slotMatchesFilters(slot);
          const dimmed = filtersActive && !matches;

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
                ${dimmed ? "opacity-30 pointer-events-none" : ""}
              `}
              style={
                isOccupied
                  ? { borderColor: color, boxShadow: `0 0 12px ${hexToRgba(color!, 0.125)}` }
                  : undefined
              }
              disabled={(!isOccupied && !isEmpty) || dimmed || isPending}
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
              role="dialog"
              aria-modal="true"
              className="fixed right-0 top-0 h-full w-full sm:w-96 bg-caveau-charcoal border-l border-[#2A2A30]/50 z-50 overflow-y-auto"
              style={{
                paddingTop: "env(safe-area-inset-top)",
                paddingRight: "env(safe-area-inset-right)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
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

      {/* Wine picker modal (empty slot) — native <dialog> gets Escape +
          focus trap + focus return for free. Backdrop click dismiss is
          wired via a click handler that checks e.target === dialog. */}
      {pickerSlot && (
        <dialog
          ref={pickerDialogRef}
          onClose={closePicker}
          onClick={(e) => {
            if (e.target === pickerDialogRef.current) closePicker();
          }}
          aria-label="Assign wine to slot"
          className="fixed inset-0 z-50 m-auto w-full max-w-md max-h-[calc(100dvh-2rem)] p-0 bg-transparent backdrop:bg-black/60 open:flex items-center justify-center"
        >
          <div className="w-full max-h-full bg-[#141416] border border-[#2A2A30]/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {showAddForm ? (
                <form ref={addFormRef} action={handleAddWineToSlot} className="flex flex-col flex-1 min-h-0">
                  <div className="p-5 border-b border-[#2A2A30]/50 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddForm(false);
                            setActionError(null);
                            addFormRef.current?.reset();
                            resetAddFormState();
                          }}
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
                        onClick={closePicker}
                        aria-label="Close"
                        className="w-9 h-9 rounded-lg bg-[#1C1C20] flex items-center justify-center text-muted hover:text-primary transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-4">
                    {actionError && (
                      <div className="p-3 rounded-xl bg-[#F87171]/10 border border-[#F87171]/20 text-[#F87171] text-sm">
                        {actionError}
                      </div>
                    )}
                    {s3Configured && (
                      <ScanLabelButton
                        visionConfigured={visionConfigured}
                        requestUploadUrlAction={requestScanUploadUrlAction}
                        scanAction={scanWineLabelAction}
                        onParsed={(r) => {
                          if (r.producer) setAddProducer(r.producer);
                          if (r.name) setAddName(r.name);
                          if (typeof r.vintage === "number") setAddVintage(String(r.vintage));
                          if (r.region) setAddRegion(r.region);
                          if (r.varietal) setAddVarietal(r.varietal);
                          setAddImageKey(r.imageKey);
                        }}
                      />
                    )}
                    <div>
                      <label htmlFor="locker-wine-name" className="block text-sm text-secondary mb-1.5">Wine Name</label>
                      <input ref={addFormNameRef} id="locker-wine-name" name="name" type="text" required value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Château Margaux" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="locker-wine-vintage" className="block text-sm text-secondary mb-1.5">Vintage</label>
                        <input id="locker-wine-vintage" name="vintage" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={addVintage} onChange={(e) => setAddVintage(e.target.value)} placeholder="2020" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="locker-wine-region" className="block text-sm text-secondary mb-1.5">Region</label>
                        <input id="locker-wine-region" name="region" type="text" required value={addRegion} onChange={(e) => setAddRegion(e.target.value)} placeholder="Bordeaux" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="locker-wine-varietal" className="block text-sm text-secondary mb-1.5">Varietal</label>
                        <input id="locker-wine-varietal" name="varietal" type="text" required value={addVarietal} onChange={(e) => setAddVarietal(e.target.value)} placeholder="Cabernet Sauvignon" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="locker-wine-producer" className="block text-sm text-secondary mb-1.5">Producer</label>
                        <input id="locker-wine-producer" name="producer" type="text" required value={addProducer} onChange={(e) => setAddProducer(e.target.value)} placeholder="Château Margaux" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="locker-wine-price" className="block text-sm text-secondary mb-1.5">Purchase Price (USD)</label>
                      <input id="locker-wine-price" name="purchasePrice" type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" maxLength={12} required placeholder="250.00" className="w-full bg-[#1C1C20] border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors" />
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
                        onClick={closePicker}
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
                        ref={pickerSearchRef}
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
          </div>
        </dialog>
      )}
    </div>
  );
}
