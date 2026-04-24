"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  Search,
  Wine,
} from "lucide-react";
import {
  getDestinationLockersAction,
  getLockerSlotsAction,
  performCrossFacilityTransferAction,
  searchWinesForTransferAction,
  type DestinationLockerOption,
  type LockerSlotOption,
  type TransferWineSearchResult,
} from "./actions";
import { showToast } from "@/components/toast";

export type FacilityOption = { id: string; name: string; location: string };

function formatWineLabel(w: TransferWineSearchResult) {
  return `${w.producer} · ${w.name} (${w.vintage})`;
}

function formatFacilityOption(f: FacilityOption) {
  return f.location ? `${f.name} — ${f.location}` : f.name;
}

export default function TransferClient({
  facilities,
}: {
  facilities: FacilityOption[];
}) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TransferWineSearchResult[]>(
    [],
  );
  const [selectedWine, setSelectedWine] =
    useState<TransferWineSearchResult | null>(null);

  const [destinationFacilityId, setDestinationFacilityId] = useState("");
  const [destinationLockers, setDestinationLockers] = useState<
    DestinationLockerOption[]
  >([]);
  const [destinationLockerId, setDestinationLockerId] = useState("");
  const [lockerSlots, setLockerSlots] = useState<LockerSlotOption[]>([]);
  const [destinationSlotId, setDestinationSlotId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isSearching, startSearch] = useTransition();
  const [isLoadingLockers, startLoadLockers] = useTransition();
  const [isLoadingSlots, startLoadSlots] = useTransition();
  const [isTransferring, startTransfer] = useTransition();

  const destinationFacility = useMemo(
    () => facilities.find((f) => f.id === destinationFacilityId) ?? null,
    [destinationFacilityId, facilities],
  );

  const selectedLocker = useMemo(
    () => destinationLockers.find((l) => l.id === destinationLockerId) ?? null,
    [destinationLockerId, destinationLockers],
  );

  const selectedSlot = useMemo(
    () => lockerSlots.find((s) => s.id === destinationSlotId) ?? null,
    [destinationSlotId, lockerSlots],
  );

  const canTransfer =
    selectedWine &&
    destinationFacilityId &&
    destinationLockerId &&
    destinationSlotId &&
    selectedSlot?.wineId == null &&
    !isTransferring;

  const resetDestination = () => {
    setDestinationFacilityId("");
    setDestinationLockers([]);
    setDestinationLockerId("");
    setLockerSlots([]);
    setDestinationSlotId("");
  };

  const handleSearch = () => {
    const trimmed = query.trim();
    setError(null);
    setSuccess(null);
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    startSearch(async () => {
      const res = await searchWinesForTransferAction(trimmed);
      if (res.ok) {
        setSearchResults(res.wines);
      } else {
        setSearchResults([]);
        setError(res.error);
      }
    });
  };

  const handlePickWine = (wine: TransferWineSearchResult) => {
    setSelectedWine(wine);
    resetDestination();
    setError(null);
    setSuccess(null);
  };

  const handlePickFacility = (facilityId: string) => {
    if (!selectedWine) return;
    setDestinationFacilityId(facilityId);
    setDestinationLockers([]);
    setDestinationLockerId("");
    setLockerSlots([]);
    setDestinationSlotId("");
    setError(null);
    setSuccess(null);

    if (!facilityId) return;

    startLoadLockers(async () => {
      const res = await getDestinationLockersAction({
        facilityId,
        memberId: selectedWine.member.id,
      });
      if (res.ok) {
        setDestinationLockers(res.lockers);
      } else {
        setDestinationLockers([]);
        setError(res.error);
      }
    });
  };

  const handlePickLocker = (lockerId: string) => {
    if (!selectedWine) return;
    setDestinationLockerId(lockerId);
    setLockerSlots([]);
    setDestinationSlotId("");
    setError(null);
    setSuccess(null);

    if (!lockerId) return;

    startLoadSlots(async () => {
      const res = await getLockerSlotsAction({
        lockerId,
        memberId: selectedWine.member.id,
      });
      if (res.ok) {
        setLockerSlots(res.slots);
      } else {
        setLockerSlots([]);
        setError(res.error);
      }
    });
  };

  const handleTransfer = () => {
    if (!selectedWine || !destinationSlotId) return;
    setError(null);
    setSuccess(null);

    startTransfer(async () => {
      const res = await performCrossFacilityTransferAction(
        selectedWine.id,
        destinationSlotId,
      );
      if (!res.ok) {
        setError(res.error);
        showToast(res.error, "error");
        return;
      }

      const wineLabel = `${res.transfer.wine.producer} · ${res.transfer.wine.name} (${res.transfer.wine.vintage})`;
      const from = `${res.transfer.source.facilityName} #${res.transfer.source.lockerNumber} · Slot ${res.transfer.source.slotPosition}`;
      const to = `${res.transfer.destination.facilityName} #${res.transfer.destination.lockerNumber} · Slot ${res.transfer.destination.slotPosition}`;
      setSuccess(`Transferred ${wineLabel}: ${from} → ${to}`);
      showToast("Transfer complete");

      setSelectedWine(null);
      setQuery("");
      setSearchResults([]);
      resetDestination();
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-burgundy/10 flex items-center justify-center">
            <Wine className="w-4 h-4 text-burgundy" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">
              1 · Wine
            </p>
            <p className="text-sm text-secondary">
              Search by barcode, producer, name, or vintage.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="sr-only" htmlFor="wine-search">
              Search wine
            </label>
            <input
              id="wine-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Scan barcode or search…"
              className="w-full bg-[#0F0F12]/60 border border-[#2A2A30]/60 rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-gold/40"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={isSearching}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-xs font-medium text-black hover:bg-gold/90 disabled:opacity-60"
          >
            <Search className="w-4 h-4" />
            {isSearching ? "Searching" : "Search"}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-[#2A2A30]/50">
            {searchResults.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => handlePickWine(w)}
                className="w-full text-left px-3 py-2 border-b border-[#2A2A30]/40 last:border-b-0 hover:bg-[#1C1C20]/40 transition-colors"
              >
                <p className="text-sm text-primary font-medium">
                  {formatWineLabel(w)}
                </p>
                <p className="text-[11px] text-muted">
                  {w.barcode ? `Barcode ${w.barcode} · ` : ""}
                  Member {w.member.name}
                </p>
                {w.location && (
                  <p className="text-[11px] text-secondary mt-0.5">
                    Stored in {w.location.facilityName} · Locker #
                    {w.location.lockerNumber} · Slot {w.location.slotPosition}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        {selectedWine && (
          <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-gold">
                  Selected
                </p>
                <p className="text-lg font-serif text-primary">
                  {formatWineLabel(selectedWine)}
                </p>
                <p className="text-xs text-muted mt-1">
                  Member {selectedWine.member.name}
                  {selectedWine.barcode
                    ? ` · Barcode ${selectedWine.barcode}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedWine(null);
                  resetDestination();
                  setSuccess(null);
                  setError(null);
                }}
                className="text-xs text-muted hover:text-primary transition-colors"
              >
                Clear
              </button>
            </div>
            {selectedWine.location ? (
              <div className="mt-3 rounded-xl bg-[#0F0F12]/50 border border-[#2A2A30]/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  Current location
                </p>
                <p className="text-sm text-secondary">
                  {selectedWine.location.facilityName} · Locker #
                  {selectedWine.location.lockerNumber} · Slot{" "}
                  {selectedWine.location.slotPosition}
                </p>
              </div>
            ) : (
              <p className="text-sm text-danger mt-3">
                This wine is not currently stored in a locker slot.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-gold/10 flex items-center justify-center">
            <ArrowRightLeft className="w-4 h-4 text-gold" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">
              2 · Destination
            </p>
            <p className="text-sm text-secondary">
              Choose facility, locker, then an empty slot.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
              Facility
            </label>
            <div className="relative">
              <select
                value={destinationFacilityId}
                onChange={(e) => handlePickFacility(e.target.value)}
                disabled={!selectedWine || isLoadingLockers}
                className="w-full appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-xl px-3 py-2 pr-9 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40 disabled:opacity-60 cursor-pointer"
              >
                <option value="">Select a facility…</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {formatFacilityOption(f)}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[10px]">
                ▾
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
              Locker
            </label>
            <div className="relative">
              <select
                value={destinationLockerId}
                onChange={(e) => handlePickLocker(e.target.value)}
                disabled={
                  !selectedWine ||
                  !destinationFacilityId ||
                  isLoadingLockers ||
                  destinationLockers.length === 0
                }
                className="w-full appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-xl px-3 py-2 pr-9 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40 disabled:opacity-60 cursor-pointer"
              >
                <option value="">
                  {destinationFacilityId
                    ? destinationLockers.length === 0
                      ? isLoadingLockers
                        ? "Loading lockers…"
                        : "No lockers for this member at this facility"
                      : "Select a locker…"
                    : "Select a facility first…"}
                </option>
                {destinationLockers.map((l) => (
                  <option key={l.id} value={l.id}>
                    Locker #{l.lockerNumber} · Zone {l.zone} · {l.emptySlots}/
                    {l.totalSlots} empty
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[10px]">
                ▾
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="block text-[10px] uppercase tracking-wider text-muted">
                Slot
              </label>
              {selectedLocker && (
                <p className="text-[11px] text-muted tabular-nums">
                  {selectedLocker.emptySlots}/{selectedLocker.totalSlots} empty
                </p>
              )}
            </div>

            {!destinationLockerId ? (
              <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F12]/40 p-6 text-center">
                <Building2 className="w-5 h-5 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted">
                  Select a destination locker to choose a slot.
                </p>
              </div>
            ) : isLoadingSlots ? (
              <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F12]/40 p-6 text-center">
                <p className="text-sm text-muted">Loading slots…</p>
              </div>
            ) : lockerSlots.length === 0 ? (
              <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F12]/40 p-6 text-center">
                <p className="text-sm text-muted">No slots found.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F12]/30 p-3">
                <div className="grid grid-cols-4 gap-2">
                  {lockerSlots.map((s) => {
                    const isEmpty = s.wineId == null;
                    const isSelected = destinationSlotId === s.id;
                    const disabled = !isEmpty || isTransferring;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          if (!isEmpty) return;
                          setDestinationSlotId(s.id);
                          setError(null);
                          setSuccess(null);
                        }}
                        disabled={disabled}
                        title={
                          isEmpty
                            ? `Empty slot ${s.slotPosition}`
                            : s.wineLabel ?? "Occupied"
                        }
                        className={`rounded-xl border px-2 py-2 text-xs font-medium tabular-nums transition-colors ${
                          isSelected
                            ? "bg-gold/10 border-gold/50 text-gold"
                            : isEmpty
                              ? "bg-[#1C1C20]/70 border-[#2A2A30]/60 text-primary hover:border-gold/40"
                              : "bg-[#111114]/60 border-[#2A2A30]/30 text-muted cursor-not-allowed"
                        }`}
                      >
                        {s.slotPosition}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted mt-3">
                  Occupied slots are disabled to prevent accidental overwrites.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {error && (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
              {success}
            </div>
          )}

          <div className="rounded-2xl border border-[#2A2A30]/60 bg-[#0F0F12]/40 p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1C1C20]/70 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-muted" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-primary font-medium">
                  Confirm transfer
                </p>
                <p className="text-xs text-muted mt-1">
                  Creates <span className="text-primary">check_out</span> and{" "}
                  <span className="text-primary">check_in</span> locker activity
                  events for audit clarity.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <div className="text-xs text-muted">
                {selectedWine && destinationFacility && selectedLocker && selectedSlot ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#2A2A30]/60 bg-[#1C1C20]/40 px-2 py-1">
                      <Wine className="w-3 h-3 text-muted" />
                      {selectedWine.vintage}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#2A2A30]/60 bg-[#1C1C20]/40 px-2 py-1">
                      <Building2 className="w-3 h-3 text-muted" />
                      {destinationFacility.name}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#2A2A30]/60 bg-[#1C1C20]/40 px-2 py-1">
                      <span className="text-muted">#</span>
                      {selectedLocker.lockerNumber}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#2A2A30]/60 bg-[#1C1C20]/40 px-2 py-1">
                      <span className="text-muted">Slot</span>
                      {selectedSlot.slotPosition}
                    </span>
                  </div>
                ) : (
                  "Select a wine and an empty destination slot."
                )}
              </div>

              <button
                type="button"
                onClick={handleTransfer}
                disabled={!canTransfer}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold/90 disabled:opacity-60"
              >
                {isTransferring ? (
                  <>
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-black/40 border-t-black animate-spin" />
                    Transferring…
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4" />
                    Transfer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

