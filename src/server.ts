import express from "express";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
const startedAt = Date.now();
let tick = 0;
const incidents = [
  { id: "INC-31", sev: "P1", title: "checkout 503 on Visa payments", source: "PagerDuty", traces: "otel: 8 spans", logs: "loki: 142 lines", metrics: "p95 4.2s", test: "checkout_visa_503.spec.ts", status: "regression-added", recurrence: 0 },
  { id: "INC-30", sev: "P2", title: "search timeout > 8s", source: "Opsgenie", traces: "otel: 12 spans", logs: "loki: 88 lines", metrics: "p99 9.1s", test: "search_timeout.spec.ts", status: "regression-added", recurrence: 0 },
  { id: "INC-29", sev: "P2", title: "cart total off by 1 Rs", source: "PagerDuty", traces: "otel: 5 spans", logs: "loki: 30 lines", metrics: "—", test: "cart_rounding.spec.ts", status: "fix-verified", recurrence: 0 },
  { id: "INC-28", sev: "P3", title: "webhook retry storm", source: "Opsgenie", traces: "otel: 3 spans", logs: "loki: 220 lines", metrics: "err rate 12%", test: "webhook_retry_spec.ts", status: "regression-added", recurrence: 0 },
  { id: "INC-22", sev: "P1", title: "refund double-charged", source: "PagerDuty", traces: "otel: 9 spans", logs: "loki: 64 lines", metrics: "—", test: "refund_exactly_once.spec.ts", status: "fix-verified", recurrence: 0 },
];
function sim() {
  tick++;
  return {
    incidents,
    totalIncidents: incidents.length,
    regressionTests: incidents.filter(i => i.status === "regression-added" || i.status === "fix-verified").length,
    recurrenceRate: 2.1, // % — low because tests catch repeats
    closedLoopMs: 180000 + tick * 1000, // avg time from incident → test in CI
    sources: ["PagerDuty", "Opsgenie", "Sentry", "Datadog"],
  };
}
app.get("/api/status", (_q, r) => r.json({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000), ...sim() }));
app.get("/health", (_q, r) => r.json({ ok: true }));
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_q, r) => r.sendFile(path.join(__dirname, "../public/index.html")));
app.listen(Number(process.env.PORT ?? 4306), () => console.log("incident-to-test → http://localhost:4306"));
