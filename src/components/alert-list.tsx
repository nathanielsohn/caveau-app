"use client";

import { formatRelativeTime } from "@/lib/utils";

export interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: Date | string;
  resolved: boolean;
  isNew?: boolean; // for live alerts
}

const severityStyles: Record<string, string> = {
  critical: "badge-danger",
  warning: "badge-warn",
  info: "badge-info",
};

const typeLabels: Record<string, string> = {
  temperature: "Temp",
  humidity: "Humidity",
  vibration: "Vibration",
  light: "Light",
  access: "Access",
};

export default function AlertList({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-secondary mb-4">
          Alert History
        </h3>
        <p className="text-sm text-muted text-center py-6">
          No alerts recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Alert History
      </h3>

      {/* Mobile: stacked cards, no horizontal scroll. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className="rounded-xl border border-[#2A2A30]/50 bg-[#1C1C20]/50 p-3 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-secondary whitespace-nowrap">
                  {typeLabels[alert.type] || alert.type}
                </span>
                <span
                  className={severityStyles[alert.severity] || "badge-info"}
                >
                  {alert.severity}
                </span>
              </div>
              {alert.isNew ? (
                <span className="badge bg-gold/10 text-gold animate-pulse">
                  NEW
                </span>
              ) : alert.resolved ? (
                <span className="text-xs text-ok whitespace-nowrap">
                  Resolved
                </span>
              ) : (
                <span className="text-xs text-warn whitespace-nowrap">
                  Active
                </span>
              )}
            </div>
            <p className="text-sm text-primary leading-snug break-words">
              {alert.message}
            </p>
            <p className="text-xs text-muted">
              {formatRelativeTime(alert.timestamp)}
            </p>
          </li>
        ))}
      </ul>

      {/* Desktop: table. */}
      <div className="hidden md:block overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2A2A30]/50">
              <th className="text-left text-xs text-muted font-medium px-5 pb-3">
                Time
              </th>
              <th className="text-left text-xs text-muted font-medium px-3 pb-3">
                Type
              </th>
              <th className="text-left text-xs text-muted font-medium px-3 pb-3">
                Severity
              </th>
              <th className="text-left text-xs text-muted font-medium px-3 pb-3">
                Message
              </th>
              <th className="text-left text-xs text-muted font-medium px-5 pb-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr
                key={alert.id}
                className="border-b border-[#2A2A30]/30 last:border-b-0"
              >
                <td className="px-5 py-3 text-muted whitespace-nowrap">
                  {formatRelativeTime(alert.timestamp)}
                </td>
                <td className="px-3 py-3 text-secondary whitespace-nowrap">
                  {typeLabels[alert.type] || alert.type}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={
                      severityStyles[alert.severity] || "badge-info"
                    }
                  >
                    {alert.severity}
                  </span>
                </td>
                <td className="px-3 py-3 text-primary">{alert.message}</td>
                <td className="px-5 py-3">
                  {alert.isNew ? (
                    <span className="badge bg-gold/10 text-gold animate-pulse">
                      NEW
                    </span>
                  ) : alert.resolved ? (
                    <span className="text-xs text-ok">Resolved</span>
                  ) : (
                    <span className="text-xs text-warn">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
