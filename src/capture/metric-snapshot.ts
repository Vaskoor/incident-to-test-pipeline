// src/capture/metric-snapshot.ts — capture Prometheus metrics at incident time
import type { MetricSnapshot } from "../types.js";

/** Check which metrics breached their thresholds at incident time. */
export function findBreaches(metrics: MetricSnapshot[]): MetricSnapshot[] {
  return metrics.filter(m => m.breached || (m.threshold !== undefined && m.value > m.threshold));
}

/** Summarize metrics for the evidence report. */
export function summarizeMetrics(metrics: MetricSnapshot[]): {
  total: number;
  breached: number;
  criticalMetrics: string[];
} {
  const breaches = findBreaches(metrics);
  return {
    total: metrics.length,
    breached: breaches.length,
    criticalMetrics: breaches.map(m => `${m.name}=${m.value}${m.unit} (threshold ${m.threshold}${m.unit})`),
  };
}

/** Build a metric timeline (for the dashboard). */
export function buildTimeline(metrics: MetricSnapshot[]): { time: number; name: string; value: number }[] {
  return metrics.map(m => ({ time: m.timestamp, name: m.name, value: m.value }));
}
