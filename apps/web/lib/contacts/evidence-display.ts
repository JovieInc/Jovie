/**
 * Client-safe evidence helpers shared by the contact and outbound surfaces.
 * No hashing or server code lives here.
 */

export interface EvidenceConfidenceInput {
  readonly confidence: number | null;
  readonly freshness: 'fresh' | 'stale' | 'unknown';
}

/** Source classes every contact needs before outreach can be certified. */
export const REQUIRED_OUTREACH_EVIDENCE = [
  'identity',
  'dsp',
  'catalog',
  'search',
  'reachability',
] as const;

/**
 * How sure we are about a fact right now. A stale observation has no current
 * confidence: showing "90% · stale" overstates it, so stale facts read as
 * stale and the old score is shown only as history.
 */
export function evidenceConfidenceLabel(item: EvidenceConfidenceInput): string {
  const score =
    item.confidence === null ? null : `${Math.round(item.confidence * 100)}%`;
  if (item.freshness === 'stale')
    return score ? `Stale, recheck (was ${score})` : 'Stale, recheck';
  if (score === null) return 'Confidence unknown';
  return item.freshness === 'unknown'
    ? `${score} confidence · age unknown`
    : `${score} confidence`;
}
