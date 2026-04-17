import { LockerGridSkeleton, Skeleton } from "@/components/skeleton";

export default function AdminLockersLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Skeleton className="w-40 h-8 mb-6" />
      <LockerGridSkeleton />
    </div>
  );
}
