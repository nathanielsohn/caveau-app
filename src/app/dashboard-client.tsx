"use client";

import PageTransition from "@/components/page-transition";
import MetricCard from "@/components/metric-card";
import { Wine, Lock, Thermometer, TrendingUp } from "lucide-react";

/** Dashboard client wrapper — provides page transition animation.
 *  Feature 05 will expand this with real data from Prisma. */
export default function DashboardClient() {
  return (
    <PageTransition className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl text-primary">Dashboard</h1>
        <p className="text-secondary mt-1">Welcome back, Alessandro</p>
      </div>

      {/* Metric cards with staggered animation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Wine}
          value="24"
          label="Bottles"
          trend={{ value: 12.5, label: "vs last month" }}
          index={0}
        />
        <MetricCard
          icon={TrendingUp}
          value="$48,200"
          label="Collection Value"
          trend={{ value: 8.3, label: "vs last month" }}
          index={1}
        />
        <MetricCard
          icon={Lock}
          value="2"
          label="Active Lockers"
          index={2}
        />
        <MetricCard
          icon={Thermometer}
          value="55.2°F"
          label="Avg. Temperature"
          trend={{ value: -0.3, label: "vs yesterday" }}
          index={3}
        />
      </div>

      {/* Placeholder for future content (feature 05 will fill this) */}
      <div className="glass-card p-8 text-center">
        <p className="text-muted text-sm">
          Collection overview and analytics will appear here.
        </p>
      </div>
    </PageTransition>
  );
}
