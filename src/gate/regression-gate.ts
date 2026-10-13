// src/gate/regression-gate.ts — add test to CI suite, gate, verify fix
import type { GeneratedTest, Incident } from "../types.js";

const suite: GeneratedTest[] = [];

/** Add a generated test to the regression suite + enable CI gate. */
export function addToSuite(test: GeneratedTest): GeneratedTest {
  test.addedToSuite = true;
  test.ciGate = true;
  suite.push(test);
  return test;
}

/** Mark a test as passing (fix verified). */
export function verifyFix(test: GeneratedTest): GeneratedTest {
  test.status = "passing";
  return test;
}

/** Get all tests in the suite. */
export function getSuite(): GeneratedTest[] {
  return [...suite];
}

/** Get all failing tests (gating CI). */
export function getFailing(): GeneratedTest[] {
  return suite.filter(t => t.status === "failing" && t.ciGate);
}

/** Check if CI should pass (no failing gated tests). */
export function ciPasses(): boolean {
  return getFailing().length === 0;
}

/** Close the loop: incident → test added → fix verified → incident resolved. */
export function closeLoop(incident: Incident, test: GeneratedTest): {
  incidentResolved: boolean;
  testInCi: boolean;
  fixVerified: boolean;
  closedLoopMs: number;
} {
  const inSuite = suite.find(t => t.id === test.id);
  return {
    incidentResolved: inSuite ? inSuite.status === "passing" : false,
    testInCi: inSuite ? inSuite.addedToSuite : false,
    fixVerified: inSuite ? inSuite.status === "passing" : false,
    closedLoopMs: inSuite ? Date.now() - incident.triggeredAt : 0,
  };
}
