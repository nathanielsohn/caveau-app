import { Skeleton } from "@/components/skeleton";

export default function SettingsInsuranceLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Skeleton className="w-56 h-8 mb-2" />
      <Skeleton className="w-80 h-4 mb-6" />
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-32 h-10 rounded-xl" />
      </div>
    </div>
  );
}

