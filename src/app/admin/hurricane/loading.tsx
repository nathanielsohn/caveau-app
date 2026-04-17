import { Skeleton } from "@/components/skeleton";

export default function AdminHurricaneLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Skeleton className="w-56 h-8 mb-2" />
      <Skeleton className="w-80 h-4 mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
