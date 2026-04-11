import { Skeleton } from "@/components/skeleton";

export default function VerifyLoading() {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      {/* Logo placeholder */}
      <Skeleton className="w-12 h-12 mb-8" />

      {/* Status icon */}
      <Skeleton className="w-12 h-12 rounded-full mb-3" />

      {/* Title */}
      <Skeleton className="w-56 h-8 mb-2" />
      <Skeleton className="w-72 h-4 mb-8" />

      {/* Card */}
      <div className="w-full max-w-md bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 sm:p-8 space-y-6">
        {/* Wine info */}
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="w-20 h-3" />
          <Skeleton className="w-48 h-6" />
          <Skeleton className="w-12 h-4" />
          <Skeleton className="w-32 h-4" />
        </div>

        <Skeleton className="w-full h-px" />

        {/* Monitoring period */}
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="w-28 h-3" />
          <Skeleton className="w-56 h-4" />
        </div>

        {/* Env stats */}
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="w-36 h-3" />
          <div className="grid grid-cols-2 gap-3 w-full">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>

        <Skeleton className="w-full h-px" />

        {/* Certificate number */}
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="w-24 h-3" />
          <Skeleton className="w-40 h-4" />
        </div>
      </div>
    </div>
  );
}
