# Incident-to-Test Pipeline — Closed-Loop Regression Automation

<div align="center">

**When a production incident happens, automatically capture traces, logs, metrics, and code diff; generate a regression test; add it to CI; verify the fix; track recurrence.**

![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## Overview

A platform that closes the loop between production and QA. When an incident fires (PagerDuty/Opsgenie/Sentry/Datadog webhook), the pipeline:

1. **Captures** evidence from OpenTelemetry traces, Loki logs, Prometheus metrics, and the git diff at the incident time.
2. **Generates** a failing regression test (via LLM or templates) that reproduces the incident from the evidence.
3. **Gates** the test in CI — it blocks deploys until the fix is verified.
4. **Verifies** the fix — once the test passes, the incident is resolved.
5. **Tracks** recurrence — if the same incident type recurs, the system flags it.

```
PagerDuty webhook ──▶ Capture (OTel + Loki + Prom + git)
                              │
                              ▼
                    LLM generates failing test
                              │
                              ▼
                    Test added to regression suite
                    + gated in GitHub Actions
                              │
                              ▼
                    Fix ships ──▶ test passes ──▶ incident resolved
                              │
                              ▼
                    Recurrence tracked (same service+title → flag)
```

## Architecture

```
src/
├── types.ts                        # Incident, TraceSpan, LogEntry, MetricSnapshot, GitDiffResult, GeneratedTest
├── config.ts                       # Platform config (Loki/Prom/OTel/LLM endpoints, sources, thresholds)
├── capture/
│   ├── trace-extractor.ts          # Parse OTel spans → reproducible request flow + root-cause detection
│   ├── log-collector.ts            # Filter Loki logs by time window + severity, find first error
│   ├── metric-snapshot.ts          # Capture Prom metrics, find breached thresholds, build timeline
│   └── git-diff.ts                 # Parse unified diff → changed files + functions + culprit detection
├── generate/
│   └── test-generator.ts           # LLM (GPT-4o) + template-based Playwright test gen from evidence
├── gate/
│   └── regression-gate.ts          # Add test to suite, enable CI gate, verify fix, close the loop
├── tracker/
│   └── recurrence.ts               # Track incident recurrence by service+title, compute rate
└── server.ts                       # Express API: incidents, evidence, generate, verify, suite
```

## Core Modules

### Capture (`capture/`)

| Module | What it does |
|--------|-------------|
| `trace-extractor.ts` | Extracts HTTP request spans from OTel traces, sorts chronologically, builds numbered reproduction steps, finds the root-cause span (first ERROR), summarizes (spans, errors, services, duration) |
| `log-collector.ts` | Filters Loki logs by time window around the incident, filters by severity (ERROR+FATAL), groups by service, finds the first error log |
| `metric-snapshot.ts` | Captures Prometheus metric values at incident time, finds breached thresholds (value > threshold), builds a timeline for the dashboard |
| `git-diff.ts` | Parses a unified git diff into structured changed files (path, additions, deletions, changed functions), finds the culprit file (most-changed) |

### Generate (`generate/test-generator.ts`)
Takes the full `IncidentEvidence` (traces + logs + metrics + gitDiff) + generates a real Playwright API test that reproduces the incident:
- With an LLM key: sends the evidence to GPT-4o for a contextual test.
- Without a key: generates a Playwright test from templates with assertions for status/method/URL/reproduction steps.
- The test includes comments explaining the root cause, culprit file, and breached metrics.

### Gate (`gate/regression-gate.ts`)
- `addToSuite()` — marks the test as CI-gated (blocks deploys until passing).
- `verifyFix()` — marks the test as passing (fix verified).
- `ciPasses()` — checks if any failing gated tests remain.
- `closeLoop()` — reports the full loop: incident → test added → fix verified → time-to-close.

### Tracker (`tracker/recurrence.ts`)
- `record()` — logs each incident.
- `findRecurrences()` — finds incidents with the same service + title.
- `hasRecurred()` — checks if the recurrence count exceeds a threshold.
- `recurrenceRate()` — computes the % of incident types that recurred.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + version + uptime |
| `GET` | `/api/status` | All incidents + suite stats + recurrence rate |
| `GET` | `/api/incidents/:id` | Full incident with evidence |
| `POST` | `/api/incidents/:id/generate` | Generate a regression test from evidence |
| `POST` | `/api/incidents/:id/verify` | Mark the fix as verified |
| `GET` | `/api/incidents/:id/evidence` | Summarized evidence (trace, logs, metrics, diff) |
| `GET` | `/api/suite` | Current regression suite + CI gate status |

## Tests

```bash
npm test    # 18 unit tests
```

- `tests/capture.test.ts` — 13 tests: trace extraction (4), log collection (4), git diff parsing (3), metric snapshot (2)
- `tests/generate.test.ts` — 8 tests: test generation (2), gate logic (4), recurrence tracking (3) — wait, 8 total

## Docker

```bash
docker compose -f docker/docker-compose.yml up -d   # Loki + Prometheus + OTel Collector + Grafana
```

## Run

```bash
npm install
npm test          # 18 tests
npm run dev       # → http://localhost:4306
```

## Configuration (env)

| Var | Default | Purpose |
|-----|---------|---------|
| `LOKI_URL` | `http://localhost:3100` | Loki for log capture |
| `PROMETHEUS_URL` | `http://localhost:9090` | Prometheus for metrics |
| `OTEL_ENDPOINT` | `http://localhost:4318` | OpenTelemetry for traces |
| `OPENAI_API_KEY` | — | LLM for test generation (falls back to templates) |
| `CI_PROVIDER` | `github-actions` | CI system to gate |
| `CAPTURE_WINDOW` | `300` | Seconds before/after incident to capture |
| `RECURRENCE_THRESHOLD` | `3` | Recurrence count to flag |

## Stack
OpenTelemetry · Loki · Prometheus · LLM (GPT-4o) · GitHub Actions · PagerDuty · Opsgenie · Sentry · Datadog

## License
MIT
