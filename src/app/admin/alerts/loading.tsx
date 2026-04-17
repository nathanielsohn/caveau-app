import { AlertListSkeleton } from "@/components/skeleton";

export default function AdminAlertsLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <AlertListSkeleton />
    </div>
  );
}
