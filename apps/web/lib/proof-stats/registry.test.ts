import { describe, expect, it } from 'vitest';
import {
  getProofStat,
  listProofStats,
  PROOF_STAT_REGISTRY,
  proofStatRegistrySchema,
} from './registry';

const base = {
  schema: 'jovie.proof-stats.registry/v1',
  rule: 'r',
  milestones: [1],
};

describe('proof-stat registry', () => {
  it('parses, with unique ids and a methodology for every public stat', () => {
    const ids = listProofStats().map(stat => stat.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const stat of listProofStats()) {
      if (stat.visibility === 'public')
        expect(stat.methodology, stat.id).toBeTruthy();
    }
    expect(PROOF_STAT_REGISTRY.milestones).toContain(100_000);
    expect(getProofStat('accounts_total')?.display.rounding.mode).toBe('floor');
    expect(getProofStat('nope')).toBeNull();
  });

  it('keeps security stats favourable-only and engineering stats internal', () => {
    expect(getProofStat('security_open_critical')?.ceiling).toBe(0);
    expect(getProofStat('security_dependabot_open')?.visibility).toBe(
      'internal'
    );
    expect(getProofStat('eng_merges_per_day')?.visibility).toBe('internal');
  });

  it('rejects duplicates, ungated comparisons, unsupported fixed sentences and mixed rounding', () => {
    const accounts = getProofStat('accounts_total')!;
    const lcp = getProofStat('profile_lcp_rank')!;
    const parse = (stats: unknown[]) =>
      proofStatRegistrySchema.safeParse({ ...base, stats }).success;
    expect(parse([accounts])).toBe(true);
    expect(parse([accounts, accounts])).toBe(false);
    expect(
      parse([{ ...lcp, source: { ...lcp.source, claim: undefined } }])
    ).toBe(false);
    expect(
      parse([
        {
          ...accounts,
          threshold: null,
          display: { ...accounts.display, sentence: 'Loved everywhere' },
        },
      ])
    ).toBe(false);
    expect(
      parse([
        {
          ...accounts,
          display: {
            ...accounts.display,
            rounding: { mode: 'floor', step: 10, sigDigits: 1 },
          },
        },
      ])
    ).toBe(false);
    expect(parse([{ ...accounts, methodology: null }])).toBe(false);
  });
});
