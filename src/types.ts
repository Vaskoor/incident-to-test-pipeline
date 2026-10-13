// src/types.ts — shared types for the Incident-to-Test Pipeline

export type IncidentSeverity = "P1" | "P2" | "P3";
export type IncidentStatus = "triggered" | "capturing" | "generating" | "regression-added" | "fix-verified" | "recurred";

export interface Incident {
  id: string;
  severity: IncidentSeverity;
  title: string;
  source: "PagerDuty" | "Opsgenie" | "Sentry" | "Datadog";
  status: IncidentStatus;
  triggeredAt: number;
  service: string;
  evidence: IncidentEvidence;
  generatedTest?: GeneratedTest;
  recurrenceCount: number;
}

export interface IncidentEvidence {
  traces: TraceSpan[];
  logs: LogEntry[];
  metrics: MetricSnapshot[];
  gitDiff: GitDiffResult;
  capturedAt: number;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  operationName: string;
  service: string;
  startTime: number;
  durationMs: number;
  status: "OK" | "ERROR";
  attributes: Record<string, string>;
  httpMethod?: string;
  httpUrl?: string;
  httpStatus?: number;
  errorMessage?: string;
}

export interface LogEntry {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  service: string;
  message: string;
  traceId?: string;
}

export interface MetricSnapshot {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  threshold?: number;
  breached: boolean;
}

export interface GitDiffResult {
  commit: string;
  author: string;
  changedFiles: { path: string; additions: number; deletions: number; changedFunctions: string[] }[];
  summary: string;
}

export interface GeneratedTest {
  id: string;
  title: string;
  framework: "playwright" | "jest" | "k6";
  code: string;
  fromIncident: string;
  reproduces: string;
  status: "failing" | "passing";
  addedToSuite: boolean;
  ciGate: boolean;
}
