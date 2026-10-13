// src/generate/test-generator.ts — LLM + template-based regression test generation from incident evidence
import type { Incident, GeneratedTest, IncidentEvidence, TraceSpan, LogEntry, GitDiffResult } from "../types.js";
import { buildReproductionSteps, findRootCause } from "../capture/trace-extractor.js";
import { summarizeLogs, findFirstError } from "../capture/log-collector.js";
import { findCulpritFile } from "../capture/git-diff.js";
import { summarizeMetrics } from "../capture/metric-snapshot.js";
import { PLATFORM_CONFIG } from "../config.js";

/** Generate a regression test from captured incident evidence. */
export async function generateTest(incident: Incident): Promise<GeneratedTest> {
  const useLLM = PLATFORM_CONFIG.llmApiKey && PLATFORM_CONFIG.llmApiKey.length > 10;
  if (useLLM) return generateWithLLM(incident);
  return generateFromTemplate(incident);
}

/** Template-based generator — produces real Playwright test code from evidence. */
function generateFromTemplate(incident: Incident): GeneratedTest {
  const ev = incident.evidence;
  const reproSteps = buildReproductionSteps(ev.traces);
  const rootCause = findRootCause(ev.traces);
  const firstError = findFirstError(ev.logs);
  const culprit = findCulpritFile(ev.gitDiff);
  const metricSummary = summarizeMetrics(ev.metrics);

  const title = `regression: ${incident.id} — ${incident.title}`;
  const reproduces = `Reproduces ${incident.id} (${incident.severity}): ${incident.title}\n` +
    `Root cause: ${rootCause ? `${rootCause.service}.${rootCause.operationName}` : "unknown"}\n` +
    `First error log: ${firstError ? firstError.message : "none"}\n` +
    `Culprit file: ${culprit ? culprit.path : "unknown"}\n` +
    `Breached metrics: ${metricSummary.criticalMetrics.join(", ") || "none"}`;

  const code = `import { test, expect } from '@playwright/test';

// ${reproduces}
// Incident: ${incident.id} (${incident.severity}) — ${incident.title}
// Source: ${incident.source} | Service: ${incident.service}
// Triggered: ${new Date(incident.triggeredAt).toISOString()}

test('${title}', async ({ request }) => {
  // Reproduction steps (from OTel trace):
${reproSteps.map(s => `  // ${s}`).join("\n")}

${ev.traces.filter(s => s.httpMethod).slice(0, 5).map((s, i) =>
`  // Step ${i+1}: ${s.httpMethod} ${s.httpUrl}
  const res${i+1} = await request.${s.httpMethod!.toLowerCase()}('${s.httpUrl}');
  ${s.httpStatus ? `expect(res${i+1}.status()).toBe(${s.httpStatus}); // prod status` : `expect(res${i+1}.ok()).toBeTruthy();`}
`).join("\n")}

  // Root cause: ${rootCause ? rootCause.operationName + " — " + (rootCause.errorMessage || "error") : "see logs"}
  // Culprit: ${culprit ? culprit.path + " (" + culprit.changedFunctions.join(", ") + ")" : "unknown"}
  // Metrics breached: ${metricSummary.breached}
});`;

  return {
    id: `test-${incident.id}-${Date.now().toString(36).slice(-4)}`,
    title,
    framework: "playwright",
    code,
    fromIncident: incident.id,
    reproduces,
    status: "failing",
    addedToSuite: false,
    ciGate: false,
  };
}

/** LLM-based generator — sends evidence to GPT-4o for a contextual test. */
async function generateWithLLM(incident: Incident): Promise<GeneratedTest> {
  const ev = incident.evidence;
  const reproSteps = buildReproductionSteps(ev.traces);
  const prompt = `Generate a Playwright API test that reproduces this incident:

Incident: ${incident.id} (${incident.severity})
Title: ${incident.title}
Service: ${incident.service}

Reproduction steps:
${reproSteps.map(s => s).join("\n")}

Root cause: ${findRootCause(ev.traces)?.errorMessage || "unknown"}
First error log: ${findFirstError(ev.logs)?.message || "none"}
Culprit file: ${findCulpritFile(ev.gitDiff)?.path || "unknown"}
Metrics breached: ${summarizeMetrics(ev.metrics).criticalMetrics.join(", ") || "none"}

Return ONLY the test code.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${PLATFORM_CONFIG.llmApiKey}` },
      body: JSON.stringify({ model: PLATFORM_CONFIG.llmModel, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
    });
    const j: any = await res.json();
    const code = j.choices?.[0]?.message?.content || generateFromTemplate(incident).code;
    return {
      id: `test-${incident.id}-${Date.now().toString(36).slice(-4)}`,
      title: `LLM: regression ${incident.id}`,
      framework: "playwright",
      code,
      fromIncident: incident.id,
      reproduces: `LLM-generated from incident ${incident.id}`,
      status: "failing",
      addedToSuite: false,
      ciGate: false,
    };
  } catch {
    return generateFromTemplate(incident);
  }
}
