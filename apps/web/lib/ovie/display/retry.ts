/** 2s, 4s, 8s, ... capped at 60s: a store blip heals in seconds, an outage does not hammer. */
export function displayRetryDelayMs(attempt: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt));
}
