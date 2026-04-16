"use client";

import { useState, useTransition } from "react";
import { reassignLockerAction } from "./actions";
import { showToast } from "@/components/toast";

interface MemberOption {
  id: string;
  name: string;
}

interface ReassignFormProps {
  lockerId: string;
  currentMemberId: string | null;
  facilityMembers: MemberOption[];
}

export default function ReassignForm({
  lockerId,
  currentMemberId,
  facilityMembers,
}: ReassignFormProps) {
  const [selectedId, setSelectedId] = useState<string>(currentMemberId ?? "");
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const nextId = value === "" ? null : value;
    setSelectedId(value);
    startTransition(async () => {
      const res = await reassignLockerAction(lockerId, nextId);
      if (res.ok) {
        showToast("Locker reassigned");
      } else {
        setSelectedId(currentMemberId ?? "");
        showToast(res.error || "Unable to reassign locker", "error");
      }
    });
  };

  return (
    <div className="relative">
      <select
        aria-label="Reassign locker to member"
        value={selectedId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="w-full appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-1.5 pr-8 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-gold/40 disabled:opacity-50 cursor-pointer"
      >
        <option value="">— Unassigned —</option>
        {facilityMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted text-[10px]">
        ▾
      </span>
    </div>
  );
}
