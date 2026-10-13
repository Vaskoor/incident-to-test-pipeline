// src/capture/trace-extractor.ts — parse OTel traces into reproducible request sequences
import type { TraceSpan } from "../types.js";

/** Extract HTTP request spans from a trace — the reproducible request flow. */
export function extractRequestFlow(spans: TraceSpan[]): TraceSpan[] {
  return spans
    .filter(s => s.httpMethod && s.httpUrl)
    .sort((a, b) => a.startTime - b.startTime);
}

/** Build a human-readable reproduction sequence from trace spans. */
export function buildReproductionSteps(spans: TraceSpan[]): string[] {
  const http = extractRequestFlow(spans);
  if (http.length === 0) return ["No HTTP spans found in trace — cannot reproduce."];
  return http.map((s, i) => {
    const status = s.httpStatus ? ` → ${s.httpStatus}` : "";
    const err = s.status === "ERROR" ? ` [ERROR: ${s.errorMessage || "unknown"}]` : "";
    return `${i+1}. ${s.httpMethod} ${s.httpUrl}${status}${err} (${s.durationMs}ms, ${s.service})`;
  });
}

/** Find the root-cause span (the first ERROR span in chronological order). */
export function findRootCause(spans: TraceSpan[]): TraceSpan | null {
  const errors = spans.filter(s => s.status === "ERROR").sort((a,b) => a.startTime - b.startTime);
  return errors[0] || null;
}

/** Summarize a trace for the evidence report. */
export function summarizeTrace(spans: TraceSpan[]): {
  totalSpans: number;
  errorSpans: number;
  services: string[];
  durationMs: number;
  rootCause?: string;
} {
  const errors = spans.filter(s => s.status === "ERROR");
  const root = findRootCause(spans);
  const start = Math.min(...spans.map(s => s.startTime), Date.now());
  const end = Math.max(...spans.map(s => s.startTime + s.durationMs), start);
  return {
    totalSpans: spans.length,
    errorSpans: errors.length,
    services: [...new Set(spans.map(s => s.service))],
    durationMs: end - start,
    rootCause: root ? `${root.service}.${root.operationName}: ${root.errorMessage || "error"}` : undefined,
  };
}
