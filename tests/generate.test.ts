// tests/generate.test.ts — tests for test generation + gate + recurrence logic
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateTest } from "../src/generate/test-generator.ts";
import { addToSuite, getSuite, getFailing, ciPasses, verifyFix, closeLoop } from "../src/gate/regression-gate.ts";
import { record, findRecurrences, hasRecurred, recurrenceRate } from "../src/tracker/recurrence.ts";
import type { Incident } from "../src/types.ts";

function mockIncident(id: string, service = "checkout", title = "503 error"): Incident {
  const now = Date.now();
  return {
    id, severity: "P1", title, source: "PagerDuty", status: "triggered",
    triggeredAt: now, service, recurrenceCount: 0,
    evidence: {
      traces: [
        { traceId:"t1", spanId:"s1", operationName:"POST /checkout", service, startTime: now-1000, durationMs:4000, status:"ERROR", attributes:{}, httpMethod:"POST", httpUrl:"/checkout", httpStatus:503, errorMessage:"timeout" },
      ],
      logs: [
        { timestamp: new Date(now-500).toISOString(), level:"ERROR", service, message:"checkout failed: 503" },
      ],
      metrics: [
        { name:"p95", value:4000, unit:"ms", timestamp:now, threshold:800, breached:true },
      ],
      gitDiff: {
        commit:"abc123", author:"dev@team",
        changedFiles: [{ path:"src/checkout.ts", additions:5, deletions:2, changedFunctions:["checkout"] }],
        summary:"1 file, 5 insertions, 2 deletions",
      },
      capturedAt: now,
    },
  };
}

describe("test-generator (template)", () => {
  test("generates a Playwright test from evidence", async () => {
    const inc = mockIncident("INC-T1");
    const test = await generateTest(inc);
    assert.ok(test.code.includes("@playwright/test"));
    assert.ok(test.code.includes("INC-T1"));
    assert.ok(test.code.includes("/checkout"));
    assert.equal(test.framework, "playwright");
    assert.equal(test.status, "failing");
  });
  test("reproduces field contains incident details", async () => {
    const inc = mockIncident("INC-T2");
    const test = await generateTest(inc);
    assert.ok(test.reproduces.includes("INC-T2"));
    assert.ok(test.reproduces.includes("checkout"));
  });
});

describe("regression-gate", () => {
  test("addToSuite marks test as gated", () => {
    const t = { id:"t1", title:"test1", framework:"playwright" as const, code:"code", fromIncident:"INC-1", reproduces:"r", status:"failing" as const, addedToSuite:false, ciGate:false };
    const result = addToSuite(t);
    assert.equal(result.addedToSuite, true);
    assert.equal(result.ciGate, true);
    assert.ok(getSuite().some(s => s.id === "t1"));
  });
  test("verifyFix marks test as passing", () => {
    const t = { id:"t2", title:"test2", framework:"playwright" as const, code:"code", fromIncident:"INC-2", reproduces:"r", status:"failing" as const, addedToSuite:true, ciGate:true };
    addToSuite(t);
    const result = verifyFix(t);
    assert.equal(result.status, "passing");
  });
  test("ciPasses is false when failing tests exist", () => {
    const t = { id:"t3", title:"test3", framework:"playwright" as const, code:"code", fromIncident:"INC-3", reproduces:"r", status:"failing" as const, addedToSuite:false, ciGate:false };
    addToSuite(t);
    assert.equal(ciPasses(), false);
    assert.ok(getFailing().length > 0);
  });
  test("closeLoop reports fix verified", () => {
    const inc = mockIncident("INC-CL");
    const t = { id:"t4", title:"test4", framework:"playwright" as const, code:"code", fromIncident:"INC-CL", reproduces:"r", status:"failing" as const, addedToSuite:false, ciGate:false };
    addToSuite(t);
    verifyFix(t);
    const loop = closeLoop(inc, t);
    assert.equal(loop.fixVerified, true);
    assert.equal(loop.testInCi, true);
  });
});

describe("recurrence tracker", () => {
  test("findRecurrences finds same service+title", () => {
    const inc1 = mockIncident("INC-R1", "search", "timeout");
    const inc2 = mockIncident("INC-R2", "search", "timeout");
    record(inc1); record(inc2);
    const rec = findRecurrences(inc2);
    assert.ok(rec.some(r => r.id === "INC-R1"));
  });
  test("hasRecurred returns true when threshold met", () => {
    const inc1 = mockIncident("INC-R3", "payments", "503");
    const inc2 = mockIncident("INC-R4", "payments", "503");
    record(inc1); record(inc2);
    assert.ok(hasRecurred(inc2, 1));
  });
  test("recurrenceRate returns a number 0-100", () => {
    const rate = recurrenceRate();
    assert.ok(rate >= 0 && rate <= 100);
  });
});
