"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import DispositionForm from "@/components/disposition-form";

interface DispositionButtonProps {
  wineId: string;
  wineName: string;
  status: string;
  recordDispositionAction: (formData: FormData) => Promise<void>;
}

const STATUS_LABELS: Record<string, string> = {
  sold: "Sold",
  transferred: "Transferred",
  consumed: "Consumed",
  gifted: "Gifted",
  removed: "Removed",
};

const STATUS_COLORS: Record<string, string> = {
  sold: "bg-gold/10 text-gold border-gold/20",
  transferred: "bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20",
  consumed: "bg-burgundy/10 text-burgundy border-burgundy/20",
  gifted: "bg-ok/10 text-ok border-ok/20",
  removed: "bg-danger/10 text-danger border-danger/20",
};

export default function DispositionButton({
  wineId,
  wineName,
  status,
  recordDispositionAction,
}: DispositionButtonProps) {
  const [showForm, setShowForm] = useState(false);

  if (status !== "in_cellar") {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex px-3 py-1.5 rounded-full text-xs font-medium border ${
            STATUS_COLORS[status] ?? "bg-muted/10 text-muted border-muted/20"
          }`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-secondary bg-caveau-graphite border border-[#2A2A30] hover:border-burgundy/50 hover:text-burgundy transition-all"
      >
        <LogOut size={16} />
        Record Disposition
      </button>

      <DispositionForm
        open={showForm}
        onClose={() => setShowForm(false)}
        wineId={wineId}
        wineName={wineName}
        recordDispositionAction={recordDispositionAction}
      />
    </>
  );
}
