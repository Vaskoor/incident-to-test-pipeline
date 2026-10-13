// tests/capture.test.ts — tests for trace extraction, log collection, git diff parsing
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractRequestFlow, buildReproductionSteps, findRootCause, summarizeTrace } from "../src/capture/trace-extractor.ts";
import { filterByWindow, filterBySeverity, findFirstError, summarizeLogs } from "../src/capture/log-collector.ts";
import { parseGitDiff, findCulpritFile } from "../src/capture/git-diff.ts";
import { findBreaches, summarizeMetrics } from "../src/capture/metric-snapshot.ts";
import type { TraceSpan, LogEntry, MetricSnapshot } from "../src/types.ts";

describe("trace-extractor", () => {
  const spans: TraceSpan[] = [
    { traceId:"t1", spanId:"s1", operationName:"GET /api/cart", service:"gateway", startTime:100, durationMs:50, status:"OK", attributes:{}, httpMethod:"GET", httpUrl:"/api/cart", httpStatus:200 },
    { traceId:"t1", spanId:"s2", operationName:"POST /checkout", service:"checkout", startTime:150, durationMs:4000, status:"ERROR", attributes:{}, httpMethod:"POST", httpUrl:"/checkout", httpStatus:503, errorMessage:"timeout" },
    { traceId:"t1", spanId:"s3", operationName:"charge_card", service:"payments", startTime:200, durationMs:3900, status:"ERROR", attributes:{}, errorMessage:"upstream timeout" },
  ];
  test("extractRequestFlow returns only HTTP spans sorted by time", () => {
    const flow = extractRequestFlow(spans);
    assert.equal(flow.length, 2);
    assert.equal(flow[0].httpUrl, "/api/cart");
    assert.equal(flow[1].httpUrl, "/checkout");
  });
  test("buildReproductionSteps produces numbered steps", () => {
    const steps = buildReproductionSteps(spans);
    assert.ok(steps[0].startsWith("1."));
    assert.ok(steps[1].startsWith("2."));
    assert.ok(steps[1].includes("ERROR"));
  });
  test("findRootCause returns first error span", () => {
    const root = findRootCause(spans);
    assert.ok(root);
    assert.equal(root.status, "ERROR");
  });
  test("summarizeTrace counts spans + services", () => {
    const s = summarizeTrace(spans);
    assert.equal(s.totalSpans, 3);
    assert.equal(s.errorSpans, 2);
    assert.ok(s.services.includes("gateway"));
    assert.ok(s.services.includes("checkout"));
  });
});

describe("log-collector", () => {
  const now = Date.now();
  const logs: LogEntry[] = [
    { timestamp: new Date(now-300000).toISOString(), level:"INFO", service:"api", message:"started" },
    { timestamp: new Date(now-100).toISOString(), level:"ERROR", service:"payments", message:"timeout", traceId:"t1" },
    { timestamp: new Date(now-50).toISOString(), level:"FATAL", service:"checkout", message:"503" },
    { timestamp: new Date(now+100000).toISOString(), level:"WARN", service:"api", message:"slow" },
  ];
  test("filterByWindow keeps only near-incident logs", () => {
    const w = filterByWindow(logs, now, 60);
    assert.ok(w.length < logs.length);
    assert.ok(w.some(l => l.level === "ERROR"));
  });
  test("filterBySeverity returns only ERROR+FATAL", () => {
    const e = filterBySeverity(logs, "ERROR");
    assert.equal(e.length, 2);
    assert.equal(e[0].level, "ERROR");
  });
  test("findFirstError returns the first error", () => {
    const e = findFirstError(logs);
    assert.ok(e);
    assert.equal(e.level, "ERROR");
    assert.equal(e.message, "timeout");
  });
  test("summarizeLogs counts totals + errors", () => {
    const s = summarizeLogs(logs);
    assert.equal(s.total, 4);
    assert.equal(s.errors, 2);
    assert.ok(s.firstError!.includes("timeout"));
  });
});

describe("git-diff", () => {
  const diff = `diff --git a/src/payments.ts b/src/payments.ts
index abc..def 100644
--- a/src/payments.ts
+++ b/src/payments.ts
@@ -10,3 +10,5 @@
   old line
+  export async function chargeCard(amount: number) {
+    return stripe.charges.create({ amount });
+  }
-  function oldCharge() {}`;
  test("parseGitDiff extracts changed files", () => {
    const r = parseGitDiff(diff, "abc123", "dev@team");
    assert.equal(r.changedFiles.length, 1);
    assert.equal(r.changedFiles[0].path, "src/payments.ts");
    assert.ok(r.changedFiles[0].additions > 0);
    assert.ok(r.changedFiles[0].deletions > 0);
  });
  test("findCulpritFile returns the most-changed file", () => {
    const r = parseGitDiff(diff, "abc123", "dev@team");
    const c = findCulpritFile(r);
    assert.ok(c);
    assert.equal(c.path, "src/payments.ts");
  });
  test("changedFunctions are extracted", () => {
    const r = parseGitDiff(diff, "abc123", "dev@team");
    assert.ok(r.changedFiles[0].changedFunctions.includes("chargeCard"));
  });
});

describe("metric-snapshot", () => {
  const metrics: MetricSnapshot[] = [
    { name:"p95_latency", value:4200, unit:"ms", timestamp:Date.now(), threshold:800, breached:true },
    { name:"error_rate", value:12, unit:"%", timestamp:Date.now(), threshold:1, breached:true },
    { name:"rps", value:142, unit:"req/s", timestamp:Date.now() },
  ];
  test("findBreaches returns only breached metrics", () => {
    const b = findBreaches(metrics);
    assert.equal(b.length, 2);
    assert.ok(b.some(m => m.name === "p95_latency"));
  });
  test("summarizeMetrics counts breached", () => {
    const s = summarizeMetrics(metrics);
    assert.equal(s.total, 3);
    assert.equal(s.breached, 2);
  });
});
