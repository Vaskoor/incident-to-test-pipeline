// src/tracker/recurrence.ts — track if an incident type recurs after a test is added
import type { Incident } from "../types.js";

const incidents: Incident[] = [];

/** Record a new incident. */
export function record(incident: Incident): void {
  incidents.push(incident);
}

/** Find incidents with the same root cause (same service + title). */
export function findRecurrences(incident: Incident): Incident[] {
  return incidents.filter(i =>
    i.id !== incident.id &&
    i.service === incident.service &&
    i.title === incident.title
  );
}

/** Check if an incident has recurred beyond the threshold. */
export function hasRecurred(incident: Incident, threshold = 2): boolean {
  return findRecurrences(incident).length >= threshold;
}

/** Compute the recurrence rate (% of incident types that recurred). */
export function recurrenceRate(): number {
  const types = new Set(incidents.map(i => `${i.service}:${i.title}`));
  if (types.size === 0) return 0;
  let recurred = 0;
  for (const type of types) {
    const [svc, ...titleParts] = type.split(":");
    const title = titleParts.join(":");
    const matching = incidents.filter(i => i.service === svc && i.title === title);
    if (matching.length > 1) recurred++;
  }
  return Math.round((recurred / types.size) * 100);
}

/** Get all tracked incidents. */
export function getAll(): Incident[] { return [...incidents]; }

/** Get stats for the dashboard. */
export function stats() {
  return {
    total: incidents.length,
    withTests: incidents.filter(i => i.generatedTest?.addedToSuite).length,
    recurring: incidents.filter(i => i.recurrenceCount > 0).length,
    rate: recurrenceRate(),
  };
}
