// src/config.ts — platform configuration
export const PLATFORM_CONFIG = {
  version: "1.0.0",
  defaultPort: 4306,
  lokiUrl: process.env.LOKI_URL || "http://localhost:3100",
  prometheusUrl: process.env.PROMETHEUS_URL || "http://localhost:9090",
  otelEndpoint: process.env.OTEL_ENDPOINT || "http://localhost:4318",
  llmApiKey: process.env.OPENAI_API_KEY || "",
  llmModel: "gpt-4o",
  ciProvider: process.env.CI_PROVIDER || "github-actions",
  captureWindowSec: Number(process.env.CAPTURE_WINDOW || "300"),
  recurrenceThreshold: Number(process.env.RECURRENCE_THRESHOLD || "3"),
  sources: ["PagerDuty", "Opsgenie", "Sentry", "Datadog"] as const,
};
