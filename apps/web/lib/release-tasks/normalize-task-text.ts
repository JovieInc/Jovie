/**
 * Normalizes a free-form release task title/description for dedup and
 * grouping in customTaskTelemetry. Deterministic, no LLM.
 */
export function normalizeTaskText(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
