import { LockerGridSkeleton } from "@/components/skeleton";

export default function LockerLoading() {
  return (
    <div className="p-6 space-y-6">
      <LockerGridSkeleton />
    </div>
  );
}
