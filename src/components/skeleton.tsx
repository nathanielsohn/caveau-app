/** Skeleton loading components for Caveau pages */

interface SkeletonProps {
  className?: string;
}

/** Basic skeleton block with shimmer animation */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-shimmer bg-gradient-to-r from-[#141416] via-[#1C1C20] to-[#141416] bg-[length:200%_100%] rounded-lg ${className}`}
    />
  );
}

/** Skeleton for a metric card */
export function MetricCardSkeleton() {
  return (
    <div className="glass-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="w-12 h-4" />
      </div>
      <div>
        <Skeleton className="w-24 h-7 mb-2" />
        <Skeleton className="w-32 h-4" />
      </div>
    </div>
  );
}

/** Skeleton for a wine card */
export function WineCardSkeleton() {
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Skeleton className="w-12 h-16 rounded-lg shrink-0" />
        <div className="flex-1">
          <Skeleton className="w-3/4 h-5 mb-2" />
          <Skeleton className="w-1/2 h-4 mb-1" />
          <Skeleton className="w-1/3 h-4" />
        </div>
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-[#2A2A30]/50">
        <Skeleton className="w-20 h-5" />
        <Skeleton className="w-16 h-5" />
      </div>
    </div>
  );
}

/** Skeleton for the locker grid */
export function LockerGridSkeleton() {
  return (
    <div className="glass-card p-6">
      <Skeleton className="w-40 h-6 mb-4" />
      <div className="grid grid-cols-8 gap-2">
        {Array.from({ length: 32 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for a chart area */
export function ChartSkeleton() {
  return (
    <div className="glass-card p-6">
      <Skeleton className="w-32 h-5 mb-4" />
      <Skeleton className="w-full h-48 rounded-xl" />
    </div>
  );
}

/** Skeleton for the alert list */
export function AlertListSkeleton() {
  return (
    <div className="glass-card p-6">
      <Skeleton className="w-24 h-5 mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-[#2A2A30]/30 last:border-0">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1">
            <Skeleton className="w-3/4 h-4 mb-1" />
            <Skeleton className="w-1/3 h-3" />
          </div>
          <Skeleton className="w-16 h-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for the dashboard page */
export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <Skeleton className="w-48 h-8 mb-2" />
        <Skeleton className="w-64 h-4" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}

/** Skeleton for the collection page */
export function CollectionSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="w-36 h-8" />
        <Skeleton className="w-28 h-10 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <WineCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the sentinel page */
export function SentinelSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="w-32 h-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <AlertListSkeleton />
    </div>
  );
}

/** Skeleton for the wine detail page */
export function WineDetailSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <Skeleton className="w-16 h-4 mb-4" />
      <div className="flex flex-col md:flex-row gap-6">
        <Skeleton className="w-48 h-64 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="w-3/4 h-8" />
          <Skeleton className="w-1/2 h-5" />
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-2/3 h-4" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the AI Advisor page */
export function AdvisorSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem-env(safe-area-inset-bottom))] md:h-screen">
      <div className="shrink-0 px-4 md:px-8 py-4 border-b border-[#2A2A30]/40">
        <Skeleton className="w-32 h-6" />
      </div>
      <div className="flex-1 overflow-hidden px-4 md:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-3">
            <Skeleton className="w-8 h-8 mx-auto rounded-lg" />
            <Skeleton className="w-64 h-8 mx-auto" />
            <Skeleton className="w-80 h-4 mx-auto" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        </div>
      </div>
      <div className="shrink-0 px-4 md:px-8 py-3 border-t border-[#2A2A30]/40">
        <div className="max-w-3xl mx-auto space-y-2">
          <Skeleton className="w-full h-12 rounded-xl" />
          <Skeleton className="w-3/4 h-3" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the certificate page */
export function CertificateSkeleton() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="glass-card p-8 space-y-6">
        <div className="text-center space-y-3">
          <Skeleton className="w-8 h-8 mx-auto" />
          <Skeleton className="w-64 h-8 mx-auto" />
          <Skeleton className="w-48 h-4 mx-auto" />
        </div>
        <Skeleton className="w-full h-px" />
        <div className="space-y-3">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-3/4 h-4" />
        </div>
      </div>
    </div>
  );
}
