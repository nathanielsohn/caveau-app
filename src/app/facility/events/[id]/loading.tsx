import { Skeleton } from "@/components/skeleton";

export default function FacilityEventLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Skeleton className="w-40 h-8 mb-2" />
      <Skeleton className="w-64 h-4 mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}
