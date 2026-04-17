import { Skeleton } from "@/components/skeleton";

export default function AdminHurricaneNewLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Skeleton className="w-56 h-8 mb-6" />
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-24" />
        <Skeleton className="w-32 h-10 rounded-xl" />
      </div>
    </div>
  );
}
