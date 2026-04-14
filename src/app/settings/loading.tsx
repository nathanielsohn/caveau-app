import { Skeleton } from "@/components/skeleton";

export default function SettingsLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div>
          <Skeleton className="w-32 h-7 mb-2" />
          <Skeleton className="w-56 h-4" />
        </div>
      </div>
      <div className="glass-card p-6 md:p-8 space-y-4">
        <Skeleton className="w-64 h-6 mb-2" />
        <Skeleton className="w-full h-4 mb-6" />
        <Skeleton className="w-full h-16 rounded-xl" />
        <Skeleton className="w-full h-20 rounded-xl" />
        <Skeleton className="w-full h-20 rounded-xl" />
        <div className="flex justify-end pt-4">
          <Skeleton className="w-36 h-11 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
