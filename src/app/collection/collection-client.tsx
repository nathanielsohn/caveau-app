"use client";

import { useState, useMemo } from "react";
import { Search, LayoutGrid, List, Plus, Wine as WineIcon, ChevronDown, TrendingUp, Package, History } from "lucide-react";
import WineCard, { type WineCardData } from "@/components/wine-card";
import AddWineForm from "@/components/add-wine-form";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

interface CollectionClientProps {
  wines: WineCardData[];
  regions: string[];
  varietals: string[];
  vintageRange: [number, number];
  addWineAction: (formData: FormData) => Promise<void>;
}

export default function CollectionClient({
  wines,
  regions,
  varietals,
  vintageRange,
  addWineAction,
}: CollectionClientProps) {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [varietalFilter, setVarietalFilter] = useState("");
  const [vintageMin, setVintageMin] = useState<number | "">("");
  const [vintageMax, setVintageMax] = useState<number | "">("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const filtered = useMemo(() => {
    return wines.filter((w) => {
      // Filter by status: default shows only in_cellar, history shows disposed
      const isInCellar = !w.status || w.status === "in_cellar";
      if (!showHistory && !isInCellar) return false;
      if (showHistory && isInCellar) return false;
      // Search by name
      if (search && !w.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      // Filter by region
      if (regionFilter && w.region !== regionFilter) return false;
      // Filter by varietal
      if (varietalFilter && w.varietal !== varietalFilter) return false;
      // Filter by vintage range
      if (vintageMin !== "" && w.vintage < vintageMin) return false;
      if (vintageMax !== "" && w.vintage > vintageMax) return false;
      return true;
    });
  }, [wines, search, regionFilter, varietalFilter, vintageMin, vintageMax, showHistory]);

  const totalValue = useMemo(
    () => filtered.reduce((sum, w) => sum + w.currentValue, 0),
    [filtered]
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
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

          {/* Filter row */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Region filter */}
            <div className="relative">
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="">All Regions</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
            </div>

            {/* Varietal filter */}
            <div className="relative">
              <select
                value={varietalFilter}
                onChange={(e) => setVarietalFilter(e.target.value)}
                className="appearance-none bg-caveau-graphite border border-[#2A2A30] rounded-xl pl-3 pr-8 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="">All Varietals</option>
                {varietals.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
            </div>

            {/* Vintage range */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={vintageMin}
                onChange={(e) =>
                  setVintageMin(e.target.value ? parseInt(e.target.value, 10) : "")
                }
                placeholder={String(vintageRange[0])}
                min={vintageRange[0]}
                max={vintageRange[1]}
                className="w-20 bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="number"
                value={vintageMax}
                onChange={(e) =>
                  setVintageMax(e.target.value ? parseInt(e.target.value, 10) : "")
                }
                placeholder={String(vintageRange[1])}
                min={vintageRange[0]}
                max={vintageRange[1]}
                className="w-20 bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>

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
            onClick={() => {
              setSearch("");
              setRegionFilter("");
              setVarietalFilter("");
              setVintageMin("");
              setVintageMax("");
            }}
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
      />
    </div>
  );
}
