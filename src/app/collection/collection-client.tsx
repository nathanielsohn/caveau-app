"use client";

import { useState, useMemo } from "react";
import { Search, LayoutGrid, List, Plus, Wine as WineIcon, ChevronDown, TrendingUp, Package, History, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import WineCard, { type WineCardData } from "@/components/wine-card";
import AddWineForm from "@/components/add-wine-form";
import { FacilityPill } from "@/components/facility-context";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import type {
  ScanUploadUrlResult,
  ScanWineLabelResult,
} from "@/app/collection/label-scan-actions";

interface LockerOption {
  id: string;
  lockerNumber: number;
}

interface CollectionClientProps {
  wines: WineCardData[];
  regions: string[];
  varietals: string[];
  producers: string[];
  lockerOptions: LockerOption[];
  vintageRange: [number, number];
  addWineAction: (formData: FormData) => Promise<void>;
  s3Configured: boolean;
  visionConfigured: boolean;
  requestScanUploadUrlAction: (
    contentType: string,
  ) => Promise<ScanUploadUrlResult>;
  scanWineLabelAction: (key: string) => Promise<ScanWineLabelResult>;
}

type SortKey = "added" | "value" | "vintage" | "name" | "drinkWindow";
type SortDir = "asc" | "desc";
type DrinkStatus = "ready" | "aging" | "past" | "none";

function getDrinkStatus(start?: number | null, end?: number | null): DrinkStatus {
  const year = new Date().getUTCFullYear();
  if (!start && !end) return "none";
  if (end && year > end) return "past";
  if (start && year >= start && (!end || year <= end)) return "ready";
  if (start && year < start) return "aging";
  return "none";
}

function drinkWindowSortValue(start?: number | null, end?: number | null): number {
  const year = new Date().getUTCFullYear();
  if (!start && !end) return Number.POSITIVE_INFINITY;
  if (end && year > end) return -1;
  if (start && year >= start && (!end || year <= end)) return 0;
  if (start && year < start) return start - year;
  return Number.POSITIVE_INFINITY;
}

export default function CollectionClient({
  wines,
  regions,
  varietals,
  producers,
  lockerOptions,
  vintageRange,
  addWineAction,
  s3Configured,
  visionConfigured,
  requestScanUploadUrlAction,
  scanWineLabelAction,
}: CollectionClientProps) {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [varietalFilter, setVarietalFilter] = useState("");
  const [producerFilter, setProducerFilter] = useState("");
  // "" = all, "unassigned" = no locker, otherwise a locker id
  const [lockerFilter, setLockerFilter] = useState("");
  const [vintageMin, setVintageMin] = useState<number | "">("");
  const [vintageMax, setVintageMax] = useState<number | "">("");
  const [priceMin, setPriceMin] = useState<number | "">("");
  const [priceMax, setPriceMax] = useState<number | "">("");
  const [drinkFilter, setDrinkFilter] = useState<"" | DrinkStatus>("");
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const filtered = useMemo(() => {
    const result = wines.filter((w) => {
      // Filter by status: default shows only in_cellar, history shows disposed
      const isInCellar = !w.status || w.status === "in_cellar";
      if (!showHistory && !isInCellar) return false;
      if (showHistory && isInCellar) return false;
      // Search by name
      if (search && !w.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (regionFilter && w.region !== regionFilter) return false;
      if (varietalFilter && w.varietal !== varietalFilter) return false;
      if (producerFilter && w.producer !== producerFilter) return false;
      if (lockerFilter === "unassigned" && w.lockerId) return false;
      if (lockerFilter && lockerFilter !== "unassigned" && w.lockerId !== lockerFilter) return false;
      if (vintageMin !== "" && w.vintage < vintageMin) return false;
      if (vintageMax !== "" && w.vintage > vintageMax) return false;
      if (priceMin !== "" && w.currentValue < priceMin) return false;
      if (priceMax !== "" && w.currentValue > priceMax) return false;
      if (drinkFilter && getDrinkStatus(w.drinkWindowStart, w.drinkWindowEnd) !== drinkFilter) return false;
      return true;
    });

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "value":
          cmp = a.currentValue - b.currentValue;
          break;
        case "vintage":
          cmp = a.vintage - b.vintage;
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "drinkWindow":
          cmp = drinkWindowSortValue(a.drinkWindowStart, a.drinkWindowEnd) - drinkWindowSortValue(b.drinkWindowStart, b.drinkWindowEnd);
          break;
        case "added":
        default:
          cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [wines, search, regionFilter, varietalFilter, producerFilter, lockerFilter, vintageMin, vintageMax, priceMin, priceMax, drinkFilter, sortKey, sortDir, showHistory]);

  function clearFilters() {
    setSearch("");
    setRegionFilter("");
    setVarietalFilter("");
    setProducerFilter("");
    setLockerFilter("");
    setVintageMin("");
    setVintageMax("");
    setPriceMin("");
    setPriceMax("");
    setDrinkFilter("");
  }

  const activeFilterCount =
    (regionFilter ? 1 : 0) +
    (varietalFilter ? 1 : 0) +
    (producerFilter ? 1 : 0) +
    (lockerFilter ? 1 : 0) +
    (vintageMin !== "" || vintageMax !== "" ? 1 : 0) +
    (priceMin !== "" || priceMax !== "" ? 1 : 0) +
    (drinkFilter ? 1 : 0);

  const totalValue = useMemo(
    () => filtered.reduce((sum, w) => sum + w.currentValue, 0),
    [filtered]
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl text-primary">
              {showHistory ? "Disposition History" : "Collection"}
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-secondary">
                <Package size={14} className="text-burgundy" />
                <span className="text-sm">{filtered.length} bottle{filtered.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="w-px h-3.5 bg-[#2A2A30]" />
              <div className="flex items-center gap-1.5 text-secondary">
                <TrendingUp size={14} className="text-ok" />
                <span className="text-sm font-medium text-primary">{formatCurrency(totalValue)}</span>
              </div>
            </div>
          </div>
          <FacilityPill />
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium border transition-all ${
              showHistory
                ? "bg-gold/10 text-gold border-gold/30"
                : "bg-caveau-graphite text-secondary border-[#2A2A30] hover:border-gold/30 hover:text-primary"
            }`}
          >
            <History size={16} />
            History
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-gold flex items-center gap-2"
          >
            <Plus size={16} />
            Add Wine
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search wines..."
              className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-9 pr-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          {/* Primary row: region, varietal, sort, more, view toggle */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                aria-label="Filter by region"
                className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
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
                className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="">All Varietals</option>
                {varietals.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>

            {lockerOptions.length > 0 && (
              <div className="relative">
                <select
                  value={lockerFilter}
                  onChange={(e) => setLockerFilter(e.target.value)}
                  aria-label="Filter by locker"
                  className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
                >
                  <option value="">All Lockers</option>
                  {lockerOptions.map((l) => (
                    <option key={l.id} value={l.id}>Locker #{l.lockerNumber}</option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            )}

            {/* Sort dropdown + direction toggle */}
            <div className="flex items-center gap-1">
              <div className="relative">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort wines by"
                  className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-8 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
                >
                  <option value="added">Recently added</option>
                  <option value="value">Value</option>
                  <option value="vintage">Vintage</option>
                  <option value="name">Name</option>
                  <option value="drinkWindow">Drink window</option>
                </select>
                <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
              <button
                onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
                title={sortDir === "asc" ? "Ascending" : "Descending"}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center px-3 rounded-xl bg-caveau-graphite border border-[#2A2A30] text-secondary hover:text-primary hover:border-gold/30 transition-colors text-xs font-medium"
              >
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>

            {/* More filters toggle */}
            <button
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              aria-expanded={showMoreFilters}
              aria-label="Toggle additional filters"
              className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-sm border transition-colors ${
                showMoreFilters || activeFilterCount > 2
                  ? "bg-gold/10 text-gold border-gold/30"
                  : "bg-caveau-graphite text-secondary border-[#2A2A30] hover:border-gold/30 hover:text-primary"
              }`}
            >
              <SlidersHorizontal size={14} />
              More
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gold/20 text-gold text-[10px] font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* View toggle — pushed to end */}
            <div className="ml-auto flex items-center gap-1 bg-caveau-graphite rounded-xl p-1 border border-[#2A2A30]">
              <button
                onClick={() => setView("grid")}
                className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                  view === "grid"
                    ? "bg-gold/10 text-gold"
                    : "text-muted hover:text-primary"
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                  view === "list"
                    ? "bg-gold/10 text-gold"
                    : "text-muted hover:text-primary"
                }`}
                aria-label="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>

          {/* Expanded filters: producer, drink window, vintage range, price range */}
          {showMoreFilters && (
            <div className="flex flex-wrap gap-3 items-center pt-3 border-t border-[#2A2A30]/50">
              <div className="relative">
                <select
                  value={producerFilter}
                  onChange={(e) => setProducerFilter(e.target.value)}
                  aria-label="Filter by producer"
                  className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer max-w-[200px] truncate"
                >
                  <option value="">All Producers</option>
                  {producers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>

              <div className="relative">
                <select
                  value={drinkFilter}
                  onChange={(e) => setDrinkFilter(e.target.value as "" | DrinkStatus)}
                  aria-label="Filter by drink window status"
                  className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
                >
                  <option value="">Any drink window</option>
                  <option value="ready">Ready to drink</option>
                  <option value="aging">Aging</option>
                  <option value="past">Past peak</option>
                  <option value="none">No window set</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>

              {/* Vintage range — only useful once at least one wine exists,
                  otherwise the placeholder shows a meaningless [2000-2025]
                  default and the filter does nothing. */}
              {wines.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Vintage</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={vintageMin}
                    onChange={(e) => setVintageMin(e.target.value ? parseInt(e.target.value, 10) : "")}
                    placeholder={String(vintageRange[0])}
                    aria-label="Minimum vintage"
                    className="w-20 bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
                  />
                  <span className="text-xs text-muted">to</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={vintageMax}
                    onChange={(e) => setVintageMax(e.target.value ? parseInt(e.target.value, 10) : "")}
                    placeholder={String(vintageRange[1])}
                    aria-label="Maximum vintage"
                    className="w-20 bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Price</span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value ? parseFloat(e.target.value) : "")}
                  placeholder="$ min"
                  aria-label="Minimum value"
                  className="w-24 bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value ? parseFloat(e.target.value) : "")}
                  placeholder="$ max"
                  aria-label="Maximum value"
                  className="w-24 bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-xs text-gold hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Wine display */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <WineIcon className="w-12 h-12 text-muted/40 mx-auto mb-3" strokeWidth={1} />
          <p className="text-secondary text-sm">
            {showHistory ? "No disposed wines yet" : "No wines match your filters"}
          </p>
          <button
            onClick={clearFilters}
            className="text-gold text-sm mt-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((wine) => (
            <WineCard key={wine.id} wine={wine} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((wine) => (
            <Link
              key={wine.id}
              href={`/wine/${wine.id}`}
              className="glass-card p-4 flex items-center gap-4 hover:border-gold/30 transition-all duration-200 group"
            >
              {/* Icon placeholder */}
              <div className="w-10 h-10 rounded-lg bg-caveau-graphite flex items-center justify-center flex-shrink-0">
                <WineIcon className="w-5 h-5 text-burgundy/60" strokeWidth={1.2} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-serif text-sm text-primary truncate group-hover:text-gold transition-colors">
                  {wine.name}
                </p>
                <p className="text-xs text-secondary">
                  {wine.vintage} &middot; {wine.region} &middot; {wine.varietal}
                </p>
              </div>

              {/* Status badge for disposed wines */}
              {wine.status && wine.status !== "in_cellar" && (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border flex-shrink-0 ${
                  wine.status === "sold" ? "bg-gold/10 text-gold border-gold/20" :
                  wine.status === "transferred" ? "bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20" :
                  wine.status === "consumed" ? "bg-burgundy/10 text-burgundy border-burgundy/20" :
                  wine.status === "gifted" ? "bg-ok/10 text-ok border-ok/20" :
                  "bg-danger/10 text-danger border-danger/20"
                }`}>
                  {wine.status.charAt(0).toUpperCase() + wine.status.slice(1)}
                </span>
              )}

              {/* Value */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-primary">
                  {formatCurrency(wine.currentValue)}
                </p>
                <p className="text-xs text-secondary">{wine.producer}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add Wine Modal */}
      <AddWineForm
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        addWineAction={addWineAction}
        s3Configured={s3Configured}
        visionConfigured={visionConfigured}
        requestScanUploadUrlAction={requestScanUploadUrlAction}
        scanWineLabelAction={scanWineLabelAction}
      />
    </div>
  );
}
