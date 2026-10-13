// src/server.ts — Incident-to-Test Pipeline: full API + dashboard
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import type { Incident, TraceSpan, LogEntry, MetricSnapshot, GitDiffResult } from "./types.js";
import { PLATFORM_CONFIG } from "./config.js";
import { buildReproductionSteps, summarizeTrace, findRootCause } from "./capture/trace-extractor.js";
import { summarizeLogs, findFirstError } from "./capture/log-collector.js";
import { summarizeMetrics } from "./capture/metric-snapshot.js";
import { parseGitDiff, findCulpritFile } from "./capture/git-diff.js";
import { generateTest } from "./generate/test-generator.js";
import { addToSuite, getSuite, getFailing, ciPasses, closeLoop } from "./gate/regression-gate.js";
import { record, stats as trackerStats, recurrenceRate } from "./tracker/recurrence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));
const startedAt = Date.now();

// --- simulated incident data (for demo without real OTel/Loki/Prom) ---
function simulateIncident(id: string, sev: "P1"|"P2"|"P3", title: string, service: string, source: Incident["source"]): Incident {
  const now = Date.now();
  const traces: TraceSpan[] = [
    { traceId: "t1", spanId: "s1", operationName: "POST /api/checkout", service, startTime: now-5000, durationMs: 4200, status: "ERROR", attributes: {}, httpMethod: "POST", httpUrl: "/api/checkout", httpStatus: 503, errorMessage: "payment gateway timeout" },
    { traceId: "t1", spanId: "s2", operationName: "charge_card", service: "payments-svc", startTime: now-4800, durationMs: 4000, status: "ERROR", attributes: {}, errorMessage: "upstream timeout (stripe)" },
    { traceId: "t1", spanId: "s3", operationName: "GET /api/cart", service: "api-gateway", startTime: now-5100, durationMs: 80, status: "OK", attributes: {}, httpMethod: "GET", httpUrl: "/api/cart", httpStatus: 200 },
  ];
  const logs: LogEntry[] = [
    { timestamp: new Date(now-5000).toISOString(), level: "INFO", service, message: "checkout started for user usr-123" },
    { timestamp: new Date(now-4800).toISOString(), level: "WARN", service: "payments-svc", message: "stripe api slow (>2s)" },
    { timestamp: new Date(now-4200).toISOString(), level: "ERROR", service: "payments-svc", message: "payment gateway timeout after 4000ms", traceId: "t1" },
    { timestamp: new Date(now-4100).toISOString(), level: "FATAL", service, message: "checkout failed: 503 service unavailable" },
  ];
  const metrics: MetricSnapshot[] = [
    { name: "http_request_duration_p95", value: 4200, unit: "ms", timestamp: now-4000, threshold: 800, breached: true },
    { name: "http_requests_total", value: 142, unit: "req/s", timestamp: now-4000 },
    { name: "error_rate", value: 12.5, unit: "%", timestamp: now-4000, threshold: 1, breached: true },
  ];
  const gitDiff: GitDiffResult = {
    commit: "a1b2c3d", author: "dev@team",
    changedFiles: [{ path: "src/payments/charge.ts", additions: 12, deletions: 3, changedFunctions: ["chargeCard"] }],
    summary: "1 file changed, 12 insertions, 3 deletions",
  };
  return { id, severity: sev, title, source, status: "triggered", triggeredAt: now, service, evidence: { traces, logs, metrics, gitDiff, capturedAt: now }, recurrenceCount: 0 };
}

// pre-seed some incidents
const incidents = new Map<string, Incident>();
const inc1 = simulateIncident("INC-31","P1","checkout 503 on Visa payments","checkout-svc","PagerDuty");
const inc2 = simulateIncident("INC-30","P2","search timeout > 8s","search-svc","Opsgenie");
const inc3 = simulateIncident("INC-29","P2","cart total off by 1 Rs","cart-svc","PagerDuty");
const inc4 = simulateIncident("INC-28","P3","webhook retry storm","notifications","Opsgenie");
const inc5 = simulateIncident("INC-22","P1","refund double-charged","payments-svc","PagerDuty");
[inc1,inc2,inc3,inc4,inc5].forEach(i => { incidents.set(i.id, i); record(i); });

app.get("/health", (_q,r) => r.json({ ok: true, version: PLATFORM_CONFIG.version, uptime: Math.round((Date.now()-startedAt)/1000) }));

app.get("/api/status", async (_q,r) => {
  const ts = trackerStats();
  const suite = getSuite();
  r.json({
    ok: true,
    incidents: [...incidents.values()].map(i => ({ ...i, evidence: undefined, generatedTest: i.generatedTest ? { ...i.generatedTest, code: undefined } : undefined })),
    totalIncidents: incidents.size,
    regressionTests: suite.length,
    failingTests: getFailing().length,
    ciPasses: ciPasses(),
    recurrenceRate: recurrenceRate(),
    closedLoopMs: 180000,
    sources: PLATFORM_CONFIG.sources,
  });
});

app.get("/api/incidents/:id", (req,r) => {
  const inc = incidents.get(req.params.id);
  if (!inc) return r.status(404).json({ error: "incident not found" });
  r.json(inc);
});

app.post("/api/incidents/:id/generate", async (req,r) => {
  const inc = incidents.get(req.params.id);
  if (!inc) return r.status(404).json({ error: "incident not found" });
  inc.status = "generating";
  const test = await generateTest(inc);
  inc.generatedTest = test;
  inc.status = "regression-added";
  addToSuite(test);
  r.json({ test, incident: { ...inc, evidence: undefined } });
});

app.post("/api/incidents/:id/verify", (req,r) => {
  const inc = incidents.get(req.params.id);
  if (!inc || !inc.generatedTest) return r.status(400).json({ error: "no test generated" });
  inc.generatedTest.status = "passing";
  inc.status = "fix-verified";
  const loop = closeLoop(inc, inc.generatedTest);
  r.json({ incident: { ...inc, evidence: undefined, generatedTest: { ...inc.generatedTest, code: undefined } }, loop });
});

app.get("/api/incidents/:id/evidence", (req,r) => {
  const inc = incidents.get(req.params.id);
  if (!inc) return r.status(404).json({ error: "incident not found" });
  const ev = inc.evidence;
  r.json({
    traceSummary: summarizeTrace(ev.traces),
    reproductionSteps: buildReproductionSteps(ev.traces),
    rootCause: findRootCause(ev.traces),
    logSummary: summarizeLogs(ev.logs),
    firstError: findFirstError(ev.logs),
    metricSummary: summarizeMetrics(ev.metrics),
    culpritFile: findCulpritFile(ev.gitDiff),
    gitDiff: ev.gitDiff,
  });
});

app.get("/api/suite", (_q,r) => r.json({ suite: getSuite(), failing: getFailing().length, ciPasses: ciPasses() }));

app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_q,r) => r.sendFile(path.join(__dirname, "../public/index.html")));

app.listen(Number(process.env.PORT ?? PLATFORM_CONFIG.defaultPort), () =>
  console.log(`incident-to-test-pipeline → http://localhost:${PLATFORM_CONFIG.defaultPort}`));
