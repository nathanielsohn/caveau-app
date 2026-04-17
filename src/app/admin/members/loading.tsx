import { Skeleton } from "@/components/skeleton";

export default function AdminMembersLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Skeleton className="w-40 h-8 mb-6" />
      <div className="glass-card p-6 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-2 border-b border-[#2A2A30]/30 last:border-0"
          >
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1">
              <Skeleton className="w-48 h-4 mb-2" />
              <Skeleton className="w-32 h-3" />
            </div>
            <Skeleton className="w-20 h-5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
