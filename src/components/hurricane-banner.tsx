import Link from "next/link";
import { CloudLightning, ShieldCheck } from "lucide-react";
import type { HurricaneStage } from "@prisma/client";
import { MEMBER_STAGE_LABELS } from "@/lib/hurricane";

interface HurricaneBannerProps {
  stormName: string;
  category: number | null;
  stage: HurricaneStage;
  bottleCount: number | null;
  facilityName: string;
}

export default function HurricaneBanner({
  stormName,
  category,
  stage,
  bottleCount,
  facilityName,
}: HurricaneBannerProps) {
  return (
    <Link
      href="/settings/hurricane"
      className="block px-4 md:px-8 pt-4"
    >
      <div className="glass-card border border-danger/40 bg-danger/10 p-4 md:p-5 hover:bg-danger/15 transition-colors">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-lg bg-danger/20 flex items-center justify-center shrink-0">
            <CloudLightning className="w-4 h-4 text-danger" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-primary font-medium">
              Hurricane {stormName}
              {category ? ` · Cat ${category}` : ""} — protocol active at{" "}
              {facilityName}
            </p>
            <p className="text-xs text-secondary mt-0.5">
              {MEMBER_STAGE_LABELS[stage]}
              {bottleCount
                ? ` · ${bottleCount} bottle${bottleCount === 1 ? "" : "s"} accounted for`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>View protocol</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
