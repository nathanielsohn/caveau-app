"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RefreshCw, Send, Sparkles } from "lucide-react";
import { showToast } from "@/components/toast";
import {
  markFirmwareUpdatedAction,
  reassignDeviceAction,
  retireDeviceAction,
  testPingDeviceAction,
} from "../actions";

interface LockerOption {
  id: string;
  lockerNumber: number;
  zone: string;
}

interface MemberOption {
  id: string;
  name: string;
}

interface Props {
  deviceId: string;
  currentLockerId: string | null;
  currentMemberId: string | null;
  currentFirmware: string;
  retired: boolean;
  facilityLockers: LockerOption[];
  facilityMembers: MemberOption[];
}

export default function ActionsPanel({
  deviceId,
  currentLockerId,
  currentMemberId,
  currentFirmware,
  retired,
  facilityLockers,
  facilityMembers,
}: Props) {
  const router = useRouter();
  const [lockerId, setLockerId] = useState(currentLockerId ?? "");
  const [memberId, setMemberId] = useState(currentMemberId ?? "");
  const [firmware, setFirmware] = useState(currentFirmware);
  const [isPending, startTransition] = useTransition();

  const reassign = () => {
    startTransition(async () => {
      const res = await reassignDeviceAction({
        deviceId,
        lockerId: lockerId === "" ? null : lockerId,
        memberId: memberId === "" ? null : memberId,
      });
      if (res.ok) {
        showToast("Device reassigned");
        router.refresh();
      } else {
        showToast(res.error, "error");
      }
    });
  };

  const bumpFirmware = () => {
    startTransition(async () => {
      const res = await markFirmwareUpdatedAction({
        deviceId,
        version: firmware,
      });
      if (res.ok) {
        showToast(`Firmware marked as ${firmware}`);
        router.refresh();
      } else {
        showToast(res.error, "error");
      }
    });
  };

  const testPing = () => {
    startTransition(async () => {
      const res = await testPingDeviceAction({ deviceId });
      if (res.ok) {
        showToast("Ping received");
        router.refresh();
      } else {
        showToast(res.error, "error");
      }
    });
  };

  const retire = () => {
    if (!confirm("Retire this device? It will stop appearing in active views.")) {
      return;
    }
    startTransition(async () => {
      const res = await retireDeviceAction({ deviceId });
      if (res.ok) {
        showToast("Device retired");
        router.refresh();
      } else {
        showToast(res.error, "error");
      }
    });
  };

  if (retired) {
    return (
      <div className="glass-card p-5">
        <p className="text-sm text-muted">
          This device is retired. Reassignment and firmware actions are
          disabled — it stays on record for audit purposes only.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
          Reassign
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select
            aria-label="Locker"
            value={lockerId}
            onChange={(e) => setLockerId(e.target.value)}
            disabled={isPending}
            className="appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
          >
            <option value="">— No locker (pool) —</option>
            {facilityLockers.map((l) => (
              <option key={l.id} value={l.id}>
                Locker #{l.lockerNumber} · Zone {l.zone}
              </option>
            ))}
          </select>
          <select
            aria-label="Member"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            disabled={isPending}
            className="appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
          >
            <option value="">— Unassigned —</option>
            {facilityMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={reassign}
          disabled={isPending}
          className="btn-gold mt-2 text-sm inline-flex items-center gap-1.5"
        >
          <RefreshCw size={14} />
          Apply reassignment
        </button>
      </div>

      <div className="border-t border-[#2A2A30]/50 pt-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
          Firmware
        </p>
        <div className="flex items-center gap-2">
          <input
            value={firmware}
            onChange={(e) => setFirmware(e.target.value)}
            disabled={isPending}
            aria-label="Firmware version"
            className="flex-1 bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
            placeholder="e.g. 2.4.1"
          />
          <button
            onClick={bumpFirmware}
            disabled={isPending || firmware === currentFirmware}
            className="btn-gold text-sm inline-flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            Mark updated
          </button>
        </div>
      </div>

      <div className="border-t border-[#2A2A30]/50 pt-4 flex flex-wrap gap-2">
        <button
          onClick={testPing}
          disabled={isPending}
          className="text-sm inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2A2A30] text-secondary hover:text-primary hover:border-[#2A2A30]/80 transition-colors"
        >
          <Send size={14} />
          Test connectivity
        </button>
        <button
          onClick={retire}
          disabled={isPending}
          className="text-sm inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 transition-colors"
        >
          <Archive size={14} />
          Retire device
        </button>
      </div>
    </div>
  );
}
