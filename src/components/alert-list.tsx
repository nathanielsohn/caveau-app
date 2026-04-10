"use client";

import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Thermometer,
  Droplets,
  Activity,
  Sun,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

export interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: Date | string;
  resolved: boolean;
}

interface AlertListProps {
  alerts: AlertItem[];
}

/** Icon for alert type */
function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "temperature":
      return <Thermometer size={14} strokeWidth={1.8} />;
    case "humidity":
      return <Droplets size={14} strokeWidth={1.8} />;
    case "vibration":
      return <Activity size={14} strokeWidth={1.8} />;
    case "light":
      return <Sun size={14} strokeWidth={1.8} />;
    default:
      return <AlertCircle size={14} strokeWidth={1.8} />;
  }
}

/** Severity badge color classes */
function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "badge-danger";
    case "warning":
      return "badge-warn";
    case "info":
    default:
      return "badge-info";
  }
}

/** Severity icon */
function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <AlertTriangle size={12} />;
    case "warning":
      return <AlertCircle size={12} />;
    case "info":
    default:
      return <Info size={12} />;
  }
}

export default function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-ok mx-auto mb-3" />
        <p className="text-primary font-medium">All Clear</p>
        <p className="text-sm text-muted mt-1">No alerts to display</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Desktop table view */}
      <div className="hidden md:block glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2A2A30]/50">
              <th className="text-left text-xs text-muted font-medium px-4 py-3 uppercase tracking-wider">
                Time
              </th>
              <th className="text-left text-xs text-muted font-medium px-4 py-3 uppercase tracking-wider">
                Type
              </th>
              <th className="text-left text-xs text-muted font-medium px-4 py-3 uppercase tracking-wider">
                Severity
              </th>
              <th className="text-left text-xs text-muted font-medium px-4 py-3 uppercase tracking-wider">
                Message
              </th>
              <th className="text-left text-xs text-muted font-medium px-4 py-3 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr
                key={alert.id}
                className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
              >
                <td className="px-4 py-3 text-secondary whitespace-nowrap">
                  {formatRelativeTime(alert.timestamp)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-secondary capitalize">
                    <TypeIcon type={alert.type} />
                    {alert.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={severityBadgeClass(alert.severity)}>
                    <SeverityIcon severity={alert.severity} />
                    <span className="ml-1 capitalize">{alert.severity}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-primary">{alert.message}</td>
                <td className="px-4 py-3">
                  {alert.resolved ? (
                    <span className="badge-ok">
                      <CheckCircle2 size={12} />
                      <span className="ml-1">Resolved</span>
                    </span>
                  ) : (
                    <span className="badge-danger">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-danger" />
                      </span>
                      <span className="ml-1.5">Active</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="glass-card p-4 space-y-2.5">
            {/* Top row: severity + status + time */}
            <div className="flex items-center justify-between">
              <span className={severityBadgeClass(alert.severity)}>
                <SeverityIcon severity={alert.severity} />
                <span className="ml-1 capitalize">{alert.severity}</span>
              </span>
              <div className="flex items-center gap-2">
                {alert.resolved ? (
                  <span className="badge-ok">
                    <CheckCircle2 size={12} />
                    <span className="ml-1">Resolved</span>
                  </span>
                ) : (
                  <span className="badge-danger">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-danger" />
                    </span>
                    <span className="ml-1.5">Active</span>
                  </span>
                )}
              </div>
            </div>

            {/* Message */}
            <p className="text-sm text-primary">{alert.message}</p>

            {/* Bottom row: type + time */}
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1 capitalize">
                <TypeIcon type={alert.type} />
                {alert.type}
              </span>
              <span>{formatRelativeTime(alert.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
