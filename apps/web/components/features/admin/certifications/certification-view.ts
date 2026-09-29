import {
  OVIE_CERTIFICATION_STATES,
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationDomainId,
  type OvieCertificationRow,
  type OvieCertificationState,
  type OvieCertificationTier,
} from '@/lib/ovie/certifications/types';

export type CertificationStateFilter = OvieCertificationState | 'all';
export type CertificationDomainFilter = OvieCertificationDomainId | 'all';

/** The review queue leads; certified work trails. */
export const CERTIFICATION_STATE_FILTERS: readonly CertificationStateFilter[] =
  ['all', 'review_ready', 'working', 'founder_locked', 'shipped', 'monitored'];

/** Data older than this is labelled stale even when the last fetch succeeded. */
export const CERTIFICATION_STALE_AFTER_MS = 5 * 60 * 1000;

export const TASTE_TIERS = OVIE_CERTIFICATION_TIERS.slice(0, 6);
export const OPERATIONAL_TIERS = OVIE_CERTIFICATION_TIERS.slice(6);

export function filterCertificationRows(
  rows: readonly OvieCertificationRow[],
  filters: {
    readonly state: CertificationStateFilter;
    readonly domain: CertificationDomainFilter;
    readonly query?: string;
  }
): OvieCertificationRow[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  return rows.filter(
    row =>
      (filters.state === 'all' || row.state === filters.state) &&
      (filters.domain === 'all' || row.domain === filters.domain) &&
      (query.length === 0 ||
        row.subject.title.toLowerCase().includes(query) ||
        row.subject.id.toLowerCase().includes(query) ||
        row.surface.toLowerCase().includes(query))
  );
}

export function countRowsByState(
  rows: readonly OvieCertificationRow[]
): Record<CertificationStateFilter, number> {
  const counts = Object.fromEntries(
    OVIE_CERTIFICATION_STATES.map(state => [state, 0])
  ) as Record<OvieCertificationState, number>;
  for (const row of rows) counts[row.state] += 1;
  return { ...counts, all: rows.length };
}

/** Rank used by the sortable State column: review queue first. */
export const CERTIFICATION_STATE_RANK: Readonly<
  Record<OvieCertificationState, number>
> = {
  review_ready: 0,
  working: 1,
  founder_locked: 2,
  shipped: 3,
  monitored: 4,
};

/** Passed tiers out of ten, used to sort by evidence completeness. */
export function passedTierCount(row: OvieCertificationRow): number {
  return OVIE_CERTIFICATION_TIERS.filter(tier => row.tiers[tier] === 'passed')
    .length;
}

export function isInventoryStale(
  generatedAt: string | undefined,
  now: number = Date.now()
): boolean {
  if (!generatedAt) return false;
  const at = Date.parse(generatedAt);
  return Number.isFinite(at) && now - at > CERTIFICATION_STALE_AFTER_MS;
}

export function evidenceForTier(
  row: OvieCertificationRow,
  tier: OvieCertificationTier
) {
  return row.evidence.filter(item => item.tier === tier);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
