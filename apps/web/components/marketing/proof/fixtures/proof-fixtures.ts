import type { ResolvedProofStat } from '@/lib/proof-stats/format';

/**
 * Story and test fixtures for the proof components. Values are illustrative
 * states of the resolver, not claims; production surfaces read the registry.
 */
export function resolvedFixture(
  overrides: Partial<ResolvedProofStat> = {}
): ResolvedProofStat {
  return {
    id: 'accounts_total',
    state: 'publishable',
    value: '100k+',
    sentence: 'Trusted by 100k+ artists and teams',
    fallback: 'Built for artists and the teams behind them',
    label: 'Accounts',
    methodology: '/proof/methodology#accounts_total',
    measuredAt: '2026-10-29T12:00:00.000Z',
    rawValue: 104_211,
    ...overrides,
  };
}

export const HIDDEN_FIXTURE = resolvedFixture({
  state: 'stale',
  value: null,
  sentence: null,
});
