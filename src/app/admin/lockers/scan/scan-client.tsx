"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ScanLine } from "lucide-react";
import { showToast } from "@/components/toast";
import {
  checkInWineAction,
  checkOutWineAction,
  getCheckInTargetsAction,
  getLockerActivityAction,
  getWineActivityAction,
  lookupWineByBarcodeAction,
  type CheckInLockerOption,
  type LockerActivityRow,
  type WineScanMatch,
} from "./actions";

export interface FacilityOption {
  id: string;
  name: string;
  location: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function actionLabel(action: string): string {
  return action === "check_in" ? "Check in" : action === "check_out" ? "Check out" : action;
}

export default function ScanClient({
  facilities,
}: {
  facilities: FacilityOption[];
}) {
  const [facilityId, setFacilityId] = useState<string>(
    facilities[0]?.id ?? "",
  );
  const [barcode, setBarcode] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [lookupResult, setLookupResult] = useState<{
    error?: string;
    wines?: WineScanMatch[];
  }>({});
  const [selectedWineId, setSelectedWineId] = useState<string | null>(null);
  const [checkInTargets, setCheckInTargets] = useState<{
    memberName: string;
    lockers: CheckInLockerOption[];
    suggested: { lockerId: string; slotPosition: number } | null;
  } | null>(null);
  const [selectedLockerId, setSelectedLockerId] = useState<string>("");
  const [selectedSlotPosition, setSelectedSlotPosition] = useState<number | "">(
    "",
  );
  const [notes, setNotes] = useState("");
  const [wineActivity, setWineActivity] = useState<LockerActivityRow[]>([]);
  const [lockerActivity, setLockerActivity] = useState<LockerActivityRow[]>([]);

  const [isPending, startTransition] = useTransition();

  const selectedWine = useMemo(() => {
    const wines = lookupResult.wines;
    if (!selectedWineId) return null;
    return wines?.find((w) => w.id === selectedWineId) ?? null;
  }, [selectedWineId, lookupResult.wines]);

  const facilityLabel = useMemo(() => {
    const f = facilities.find((f) => f.id === facilityId);
    return f ? f.name : "Facility";
  }, [facilityId, facilities]);

  const selectedLocker = useMemo(() => {
    if (!checkInTargets) return null;
    return checkInTargets.lockers.find((l) => l.id === selectedLockerId) ?? null;
  }, [checkInTargets, selectedLockerId]);

  const slotOptions = selectedLocker?.emptySlots ?? [];

  const focusBarcode = () => {
    const el = barcodeRef.current;
    if (!el) return;
    el.focus();
    el.select();
  };

  useEffect(() => {
    focusBarcode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Reset per-facility state so a stale selection can't accidentally act on
    // the wrong facility.
    setLookupResult({});
    setSelectedWineId(null);
    setCheckInTargets(null);
    setSelectedLockerId("");
    setSelectedSlotPosition("");
    setNotes("");
    setWineActivity([]);
    setLockerActivity([]);
    focusBarcode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  const refreshActivity = (wineId: string, lockerId?: string) => {
    startTransition(async () => {
      const [wineRes, lockerRes] = await Promise.all([
        getWineActivityAction({ wineId }),
        lockerId ? getLockerActivityAction({ lockerId }) : Promise.resolve(null),
      ]);

      if (wineRes?.ok) setWineActivity(wineRes.activities);
      if (lockerRes?.ok) setLockerActivity(lockerRes.activities);
    });
  };

  const handleLookup = () => {
    if (!facilityId) {
      setLookupResult({ error: "Select a facility first" });
      return;
    }
    const trimmed = barcode.trim();
    if (!trimmed) {
      setLookupResult({ error: "Scan a barcode" });
      return;
    }

    setLookupResult({});
    setSelectedWineId(null);
    setCheckInTargets(null);
    setSelectedLockerId("");
    setSelectedSlotPosition("");
    setNotes("");
    setWineActivity([]);
    setLockerActivity([]);

    startTransition(async () => {
      const res = await lookupWineByBarcodeAction({ facilityId, barcode: trimmed });
      if (!res.ok) {
        setLookupResult({ error: res.error || "Lookup failed" });
        return;
      }

      setLookupResult({ wines: res.wines });
      if (res.wines.length === 1) {
        const only = res.wines[0];
        if (only) setSelectedWineId(only.id);
      } else {
        focusBarcode();
      }
    });
  };

  const refreshLookupAndSelect = async (wineIdToSelect: string) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;

    const res = await lookupWineByBarcodeAction({ facilityId, barcode: trimmed });
    if (!res.ok) return;
    setLookupResult({ wines: res.wines });
    const stillThere = res.wines.find((w) => w.id === wineIdToSelect);
    if (stillThere) setSelectedWineId(wineIdToSelect);
  };

  useEffect(() => {
    if (!selectedWine) return;
    refreshActivity(selectedWine.id, selectedWine.currentSlot?.lockerId);

    if (selectedWine.currentSlot) {
      setCheckInTargets(null);
      setSelectedLockerId("");
      setSelectedSlotPosition("");
      return;
    }

    startTransition(async () => {
      const targets = await getCheckInTargetsAction({
        facilityId,
        wineId: selectedWine.id,
      });
      if (!targets.ok) {
        setCheckInTargets(null);
        return;
      }
      setCheckInTargets({
        memberName: targets.memberName,
        lockers: targets.lockers,
        suggested: targets.suggested,
      });
      if (targets.suggested) {
        setSelectedLockerId(targets.suggested.lockerId);
        setSelectedSlotPosition(targets.suggested.slotPosition);
      } else if (targets.lockers.length > 0) {
        const first = targets.lockers[0];
        if (first) {
          setSelectedLockerId(first.id);
          setSelectedSlotPosition(first.emptySlots[0] ?? "");
        }
      }
    });
  }, [facilityId, selectedWine]);

  useEffect(() => {
    if (!selectedLocker) {
      setSelectedSlotPosition("");
      return;
    }
    if (selectedSlotPosition === "" || !slotOptions.includes(Number(selectedSlotPosition))) {
      setSelectedSlotPosition(selectedLocker.emptySlots[0] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLockerId]);

  const handleCheckIn = () => {
    if (!selectedWine) return;
    if (!selectedLockerId || selectedSlotPosition === "") {
      showToast("Pick a locker and slot", "error");
      return;
    }

    startTransition(async () => {
      const res = await checkInWineAction({
        facilityId,
        wineId: selectedWine.id,
        lockerId: selectedLockerId,
        slotPosition: selectedSlotPosition,
        notes,
      });
      if (!res.ok) {
        showToast(res.error || "Unable to check in", "error");
        focusBarcode();
        return;
      }
      showToast("Checked in");
      await refreshLookupAndSelect(selectedWine.id);
      refreshActivity(selectedWine.id);
      focusBarcode();
    });
  };

  const handleCheckOut = () => {
    if (!selectedWine?.currentSlot) return;
    const slot = selectedWine.currentSlot;

    if (slot.facilityId !== facilityId) {
      showToast(`Switch facility to ${slot.facilityName} to check out`, "error");
      return;
    }

    startTransition(async () => {
      const res = await checkOutWineAction({
        facilityId,
        wineId: selectedWine.id,
        lockerId: slot.lockerId,
        slotPosition: slot.slotPosition,
        notes,
      });
      if (!res.ok) {
        showToast(res.error || "Unable to check out", "error");
        focusBarcode();
        return;
      }
      showToast("Checked out");
      await refreshLookupAndSelect(selectedWine.id);
      refreshActivity(selectedWine.id, slot.lockerId);
      focusBarcode();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/lockers"
          className="inline-flex items-center gap-2 text-xs text-muted hover:text-primary"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to lockers
        </Link>
        <div className="inline-flex items-center gap-2 text-xs text-muted">
          <ScanLine className="w-4 h-4 text-gold" />
          Scanner
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted">
              Facility
            </label>
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="mt-1 w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted">
              Barcode
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookup();
              }}
              className="mt-1 flex gap-2"
            >
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan and press Enter"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-[#0F0F11] border border-[#2A2A30]/60 rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-gold/40"
              />
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-gold px-4 py-2 text-xs font-medium text-black hover:bg-gold/90 disabled:opacity-60"
              >
                Lookup
              </button>
            </form>
            <p className="mt-1 text-xs text-muted">
              Active: <span className="text-secondary">{facilityLabel}</span>
            </p>
            {lookupResult.error ? (
              <p className="mt-2 text-sm text-red-400">{lookupResult.error}</p>
            ) : null}
            {lookupResult.wines && lookupResult.wines.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No matches.</p>
            ) : null}
          </div>
        </div>
      </div>

      {lookupResult.wines && lookupResult.wines.length > 1 && !selectedWine ? (
        <div className="glass-card p-4">
          <p className="text-xs text-muted mb-3">
            Multiple bottles match this barcode. Pick the correct one.
          </p>
          <div className="space-y-2">
            {lookupResult.wines.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWineId(w.id)}
                className="w-full text-left rounded-xl border border-[#2A2A30]/60 bg-[#1C1C20]/60 hover:bg-[#1C1C20]/80 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-primary text-sm font-medium">
                      {w.producer} · {w.name} ({w.vintage})
                    </p>
                    <p className="text-xs text-muted">Member: {w.member.name}</p>
                  </div>
                  {w.currentSlot ? (
                    <span className="text-[10px] uppercase tracking-wider text-muted">
                      Stored
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-muted">
                      Unstored
                    </span>
                  )}
                </div>
                {w.currentSlot ? (
                  <p className="mt-1 text-xs text-secondary">
                    {w.currentSlot.facilityName} · Locker #{w.currentSlot.lockerNumber} · Slot{" "}
                    {w.currentSlot.slotPosition}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedWine ? (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-primary font-serif text-lg">
                {selectedWine.producer}
              </p>
              <p className="text-sm text-secondary">
                {selectedWine.name} · {selectedWine.vintage}
              </p>
              <p className="text-xs text-muted">
                Member: {selectedWine.member.name}
              </p>
            </div>
            <div className="text-right">
              {selectedWine.currentSlot ? (
                <span className="badge-ok">Stored</span>
              ) : (
                <span className="badge-info">Unstored</span>
              )}
            </div>
          </div>

          <div className="border-t border-[#2A2A30]/60 pt-3 space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted">
              Notes (optional)
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g. intake, photo taken, label damaged…"
              className="w-full bg-[#0F0F11] border border-[#2A2A30]/60 rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-gold/40"
            />
          </div>

          {selectedWine.currentSlot ? (
            <div className="space-y-2">
              <div className="rounded-xl bg-[#0F0F11] border border-[#2A2A30]/60 p-3">
                <p className="text-xs text-muted mb-1">Current location</p>
                <p className="text-sm text-primary">
                  {selectedWine.currentSlot.facilityName} · Locker #
                  {selectedWine.currentSlot.lockerNumber} · Zone{" "}
                  {selectedWine.currentSlot.zone} · Slot{" "}
                  {selectedWine.currentSlot.slotPosition}
                </p>
                {selectedWine.currentSlot.dateStored ? (
                  <p className="text-xs text-muted mt-1">
                    Stored {formatWhen(selectedWine.currentSlot.dateStored)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleCheckOut}
                disabled={isPending}
                className="w-full rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-white hover:bg-burgundy/90 disabled:opacity-60"
              >
                Check out
              </button>
              {selectedWine.currentSlot.facilityId !== facilityId ? (
                <p className="text-xs text-muted">
                  This bottle is stored at{" "}
                  <span className="text-secondary">
                    {selectedWine.currentSlot.facilityName}
                  </span>
                  . Switch facility to check out.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Locker
                  </p>
                  <select
                    value={selectedLockerId}
                    onChange={(e) => setSelectedLockerId(e.target.value)}
                    className="mt-1 w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
                  >
                    {checkInTargets?.lockers?.length ? (
                      checkInTargets.lockers.map((l) => (
                        <option key={l.id} value={l.id}>
                          Locker #{l.lockerNumber} · Zone {l.zone} ·{" "}
                          {l.emptySlots.length} empty
                        </option>
                      ))
                    ) : (
                      <option value="">No lockers found</option>
                    )}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Slot (empty)
                  </p>
                  <select
                    value={selectedSlotPosition === "" ? "" : String(selectedSlotPosition)}
                    onChange={(e) =>
                      setSelectedSlotPosition(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="mt-1 w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
                  >
                    {slotOptions.length ? (
                      slotOptions.map((pos) => (
                        <option key={pos} value={pos}>
                          Slot {pos}
                        </option>
                      ))
                    ) : (
                      <option value="">No empty slots</option>
                    )}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={isPending || slotOptions.length === 0}
                className="w-full rounded-xl bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold/90 disabled:opacity-60"
              >
                Check in
              </button>
              {checkInTargets ? (
                <p className="text-xs text-muted">
                  Target member:{" "}
                  <span className="text-secondary">{checkInTargets.memberName}</span>
                </p>
              ) : null}
            </div>
          )}

          <div className="border-t border-[#2A2A30]/60 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted uppercase tracking-wider">
                Recent activity
              </p>
              <button
                type="button"
                onClick={() =>
                  refreshActivity(selectedWine.id, selectedWine.currentSlot?.lockerId)
                }
                disabled={isPending}
                className="text-xs text-muted hover:text-primary"
              >
                Refresh
              </button>
            </div>

            {wineActivity.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {wineActivity.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl bg-[#0F0F11] border border-[#2A2A30]/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-primary font-medium">
                          {actionLabel(a.action)} · Slot {a.slotPosition} · Locker #
                          {a.locker.lockerNumber}
                        </p>
                        <p className="text-xs text-muted">
                          {a.locker.facilityName} · Zone {a.locker.zone}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted">
                        <p>{formatWhen(a.occurredAt)}</p>
                        <p>{a.actorName}</p>
                      </div>
                    </div>
                    {a.notes ? (
                      <p className="text-xs text-secondary mt-2">{a.notes}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {lockerActivity.length > 0 ? (
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted mb-2">
                  Locker log
                </p>
                <div className="space-y-2">
                  {lockerActivity.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl bg-[#0F0F11] border border-[#2A2A30]/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm text-primary font-medium">
                            {actionLabel(a.action)} · Slot {a.slotPosition}
                          </p>
                          {a.wine ? (
                            <p className="text-xs text-muted">
                              {a.wine.producer} · {a.wine.name} ({a.wine.vintage}) ·{" "}
                              {a.wine.memberName}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right text-xs text-muted">
                          <p>{formatWhen(a.occurredAt)}</p>
                          <p>{a.actorName}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isPending ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted">
          <CheckCircle2 className="w-4 h-4 animate-pulse text-gold" />
          Working…
        </div>
      ) : null}
    </div>
  );
}
