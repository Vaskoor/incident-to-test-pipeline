# Incident-to-Test Pipeline — Closed-Loop Regression Automation

<div align="center">**When a production incident happens, automatically capture traces, logs, metrics, and code diff; generate a regression test; add it to CI; verify the fix.**</div>

## What it does
1. **Trigger** — a PagerDuty/Opsgenie/Sentry webhook fires the pipeline on every P1/P2.
2. **Capture** — pull OpenTelemetry traces, Loki logs, Prometheus metrics, and the git diff at the incident time.
3. **Generate** — an LLM produces a failing test that reproduces the incident from the captured evidence.
4. **Gate** — the test is added to the regression suite and gated in GitHub Actions.
5. **Verify** — once the fix ships, the test flips green; recurrence is tracked.

## Architecture
| Layer | Tech |
|-------|------|
| Trigger | PagerDuty, Opsgenie, Sentry, Datadog webhooks |
| Capture | OpenTelemetry, Loki, Prometheus, git |
| Generation | LLM (GPT-4o / Claude) |
| CI gate | GitHub Actions |
| Dashboard | this UI (incident feed + recurrence rate) |

## Run
```bash
npm install && npm run dev   # → http://localhost:4306
```
## Why it's OG
Closes the loop between production and QA. Startup-worthy.
## License
MIT
