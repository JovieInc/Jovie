/** Deliberate-red: missing/stale counts coerced to zero; lifetime as period (ASR-044). */
export function renderAudienceStats(total: number | null, lifetime: number) {
  const shown = total ?? 0; // missing must stay null/unknown, not zero
  const weekSpike = lifetime; // lifetime total presented as a period metric
  return { shown, weekSpike };
}
