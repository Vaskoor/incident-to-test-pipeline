// src/capture/log-collector.ts — pull + filter Loki-style logs around an incident
import type { LogEntry } from "../types.js";

/** Filter logs to a time window around the incident. */
export function filterByWindow(logs: LogEntry[], incidentTime: number, windowSec: number): LogEntry[] {
  const start = incidentTime - windowSec * 1000;
  const end = incidentTime + windowSec * 1000;
  return logs.filter(l => {
    const ts = new Date(l.timestamp).getTime();
    return ts >= start && ts <= end;
  });
}

/** Filter to ERROR/FATAL logs only. */
export function filterBySeverity(logs: LogEntry[], minLevel: LogEntry["level"] = "ERROR"): LogEntry[] {
  const order: Record<string, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };
  const min = order[minLevel] || 3;
  return logs.filter(l => (order[l.level] || 0) >= min);
}

/** Group logs by service. */
export function groupByService(logs: LogEntry[]): Record<string, LogEntry[]> {
  const out: Record<string, LogEntry[]> = {};
  for (const l of logs) {
    if (!out[l.service]) out[l.service] = [];
    out[l.service].push(l);
  }
  return out;
}

/** Find the first error log (root-cause log). */
export function findFirstError(logs: LogEntry[]): LogEntry | null {
  return logs.find(l => l.level === "ERROR" || l.level === "FATAL") || null;
}

/** Summarize logs for the evidence report. */
export function summarizeLogs(logs: LogEntry[]): {
  total: number;
  errors: number;
  services: string[];
  firstError?: string;
} {
  const errors = filterBySeverity(logs);
  const first = findFirstError(logs);
  return {
    total: logs.length,
    errors: errors.length,
    services: [...new Set(logs.map(l => l.service))],
    firstError: first ? `[${first.timestamp}] ${first.service}: ${first.message}` : undefined,
  };
}
