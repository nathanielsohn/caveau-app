"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import MetricCard from "@/components/metric-card";

// Recharts is ~80KB gzipped — defer it so the dashboard's LCP doesn't
// pay for the chart bundle, and show a placeholder block in its place.
const ChartPlaceholder = ({ height }: { height: string }) => (
  <div
    className={`glass-card ${height} animate-pulse`}
    aria-label="Loading chart"
  />
);

const CollectionValueChart = dynamic(
  () => import("@/components/dashboard-charts").then((m) => m.CollectionValueChart),
  { ssr: false, loading: () => <ChartPlaceholder height="h-80" /> },
);
const StorageUtilizationChart = dynamic(
  () => import("@/components/dashboard-charts").then((m) => m.StorageUtilizationChart),
  { ssr: false, loading: () => <ChartPlaceholder height="h-80" /> },
);
const AlertFrequencyChart = dynamic(
  () => import("@/components/dashboard-charts").then((m) => m.AlertFrequencyChart),
  { ssr: false, loading: () => <ChartPlaceholder height="h-80" /> },
);
import {
  DollarSign,
  Wine,
  Building2,
  AlertTriangle,
  TrendingUp,
  Clock,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface MetricsData {
  totalValue: string;
  valueTrend: number;
  bottleCount: number;
  totalSlots: number;
  activeAlertCount: number;
  facilityCount: number;
}

interface TopWine {
  id: string;
  name: string;
  vintage: number;
  region: string;
  currentValue: string;
  purchasePrice: string;
  appreciation: number;
}

interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  resolved: boolean;
  lockerNumber: number;
  facilityName: string;
}

interface ValuationPoint {
  date: string;
  value: number;
}

interface AlertFrequencyPoint {
  date: string;
  count: number;
}

interface AppreciationWine {
  id: string;
  name: string;
  vintage: number;
  appreciation: number;
  currentValue: string;
}

interface DashboardClientProps {
  metrics: MetricsData;
  topWines: TopWine[];
  alerts: AlertItem[];
  valuationTrend: ValuationPoint[];
  alertFrequency: AlertFrequencyPoint[];
  topGainers: AppreciationWine[];
  topLosers: AppreciationWine[];
}

function severityBadgeClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "badge-danger";
    case "warning":
      return "badge-warn";
    case "info":
      return "badge-info";
    default:
      return "badge-info";
  }
}

export default function DashboardClient({
  metrics,
  topWines,
  alerts,
  valuationTrend,
  alertFrequency,
  topGainers,
  topLosers,
}: DashboardClientProps) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "Member";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl md:text-4xl text-primary">
          Dashboard
        </h1>
        <p className="text-secondary text-sm mt-1">
          Welcome back, {firstName}
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          icon={DollarSign}
          value={metrics.totalValue}
          label="Collection Value"
          trend={{
            value: metrics.valueTrend,
            label: "vs purchase price",
          }}
        />
        <MetricCard
          icon={Wine}
          value={`${metrics.bottleCount}`}
          label="Bottles Stored"
        />
        <MetricCard
          icon={AlertTriangle}
          value={`${metrics.activeAlertCount}`}
          label="Active Alerts"
        />
        <MetricCard
          icon={Building2}
          value={`${metrics.facilityCount}`}
          label={metrics.facilityCount === 1 ? "Facility" : "Facilities"}
        />
      </div>

      {/* Two-column layout: Top Wines + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Wines by Value */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-primary">
              Top Wines by Value
            </h2>
            <Link
              href="/collection"
              className="text-xs text-gold hover:text-gold-text transition-colors"
            >
              View all
            </Link>
          </div>

          {topWines.length === 0 ? (
            <p className="text-secondary text-sm py-6 text-center">
              No wines in collection yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2A2A30]/50">
                    <th className="text-left text-muted font-medium pb-3 pr-4">
                      Wine
                    </th>
                    <th className="text-right text-muted font-medium pb-3 px-4 hidden sm:table-cell">
                      Purchase
                    </th>
                    <th className="text-right text-muted font-medium pb-3 px-4">
                      Value
                    </th>
                    <th className="text-right text-muted font-medium pb-3 pl-4 hidden sm:table-cell">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topWines.map((wine) => (
                    <tr
                      key={wine.id}
                      className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-caveau-graphite/30 transition-colors"
                    >
                      <td className="py-3 pr-4 max-w-0">
                        <Link
                          href={`/wine/${wine.id}`}
                          className="block hover:text-gold transition-colors"
                        >
                          <p className="font-serif text-primary truncate">
                            {wine.name}
                          </p>
                          <p className="text-xs text-muted mt-0.5 truncate">
                            {wine.vintage} &middot; {wine.region}
                          </p>
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-right text-secondary hidden sm:table-cell">
                        {wine.purchasePrice}
                      </td>
                      <td className="py-3 px-4 text-right text-primary font-medium">
                        {wine.currentValue}
                      </td>
                      <td className="py-3 pl-4 text-right hidden sm:table-cell">
                        <span
                          className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                            wine.appreciation >= 0
                              ? "text-ok"
                              : "text-danger"
                          }`}
                        >
                          <TrendingUp
                            size={12}
                            className={
                              wine.appreciation < 0
                                ? "rotate-180"
                                : ""
                            }
                          />
                          {wine.appreciation >= 0 ? "+" : ""}
                          {wine.appreciation.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Alerts */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-primary">
              Recent Alerts
            </h2>
            <Link
              href="/sentinel"
              className="text-xs text-gold hover:text-gold-text transition-colors"
            >
              View all
            </Link>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-8 h-8 text-muted mx-auto mb-2" />
              <p className="text-secondary text-sm">No recent alerts</p>
              <p className="text-muted text-xs mt-1">
                All systems operating normally
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-caveau-graphite/30"
                >
                  <AlertTriangle
                    size={16}
                    className={`mt-0.5 flex-shrink-0 ${
                      alert.severity === "critical"
                        ? "text-danger"
                        : alert.severity === "warning"
                        ? "text-warn"
                        : "text-info"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={severityBadgeClass(alert.severity)}>
                        {alert.severity}
                      </span>
                      {alert.resolved && (
                        <span className="badge-ok">resolved</span>
                      )}
                    </div>
                    <p className="text-sm text-primary truncate">
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted">
                      <Clock size={10} />
                      <span className="truncate">
                        {formatRelativeTime(alert.timestamp)} &middot; Locker #
                        {alert.lockerNumber}
                        {alert.facilityName && ` · ${alert.facilityName}`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Appreciation */}
      {(topGainers.length > 0 || topLosers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Gainers */}
          {topGainers.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-ok" />
                <h2 className="font-serif text-lg text-primary">
                  Top Gainers
                </h2>
              </div>
              <div className="space-y-3">
                {topGainers.map((wine, i) => (
                  <Link
                    key={wine.id}
                    href={`/wine/${wine.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-caveau-graphite/30 hover:bg-caveau-graphite/50 transition-colors group"
                  >
                    <span className="text-xs text-muted font-medium w-5">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-serif text-sm text-primary truncate group-hover:text-gold transition-colors">
                        {wine.name}
                      </p>
                      <p className="text-xs text-muted">{wine.vintage}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-ok">
                        +{wine.appreciation.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted">
                        {wine.currentValue}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Top Losers */}
          {topLosers.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-danger rotate-180" />
                <h2 className="font-serif text-lg text-primary">
                  Underperformers
                </h2>
              </div>
              <div className="space-y-3">
                {topLosers.map((wine, i) => (
                  <Link
                    key={wine.id}
                    href={`/wine/${wine.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-caveau-graphite/30 hover:bg-caveau-graphite/50 transition-colors group"
                  >
                    <span className="text-xs text-muted font-medium w-5">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-serif text-sm text-primary truncate group-hover:text-gold transition-colors">
                        {wine.name}
                      </p>
                      <p className="text-xs text-muted">{wine.vintage}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-danger">
                        {wine.appreciation.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted">
                        {wine.currentValue}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CollectionValueChart data={valuationTrend} />
        </div>
        <StorageUtilizationChart
          occupied={metrics.bottleCount}
          total={metrics.totalSlots}
        />
      </div>
      <AlertFrequencyChart data={alertFrequency} />
    </div>
  );
}
