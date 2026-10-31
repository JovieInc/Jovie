import { describe, expect, it } from 'vitest';
import { PROOF_STATS_KIND, validateProofStatsRecord } from './content-kind';
import {
  crossedMilestones,
  formatProofValue,
  type ProofStatObservation,
  renderBoundCopy,
  resolveProofStat,
  roundConservative,
} from './format';
import { computeProofStatsMetrics } from './metrics';
import {
  getProofStat,
  listProofStats,
  type ProofStatDefinition,
  proofStatRegistrySchema,
} from './registry';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function observation(
  value: number,
  ageHours = 1,
  extra: Partial<ProofStatObservation> = {}
): ProofStatObservation {
  return {
    value,
    measuredAt: new Date(NOW.getTime() - ageHours * HOUR).toISOString(),
    source: 'cron:proof-stats',
    ...extra,
  };
}

function stat(id: string): ProofStatDefinition {
  const found = getProofStat(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

const PUBLIC = { now: NOW, surface: 'public' as const };

describe('conservative rounding', () => {
  it('floors counts to significant digits and never rounds up', () => {
    const rounding = { mode: 'floor' as const, sigDigits: 1 };
    expect(roundConservative(12_345, rounding)).toBe(10_000);
    expect(roundConservative(199_999, rounding)).toBe(100_000);
    expect(roundConservative(100_000, rounding)).toBe(100_000);
    expect(roundConservative(0, rounding)).toBe(0);
  });

  it('ceils lower-is-better values to a step', () => {
    expect(roundConservative(63.1, { mode: 'ceil', step: 10 })).toBe(70);
    expect(roundConservative(70, { mode: 'ceil', step: 10 })).toBe(70);
    expect(roundConservative(0.29, { mode: 'floor', step: 0.01 })).toBe(0.29);
  });

  it('formats compact counts with + only when below the true value', () => {
    const rounding = {
      mode: 'floor' as const,
      sigDigits: 1,
      suffix: '+',
      compact: true,
    };
    expect(formatProofValue(100_000, rounding)).toBe('100k');
    expect(formatProofValue(123_456, rounding)).toBe('100k+');
    expect(formatProofValue(1_999_999, rounding)).toBe('1M+');
    expect(formatProofValue(12, rounding)).toBe('10+');
    expect(
      formatProofValue(0.4242, { mode: 'floor', step: 0.01, percent: true })
    ).toBe('42%');
    expect(formatProofValue(1234, { mode: 'exact' })).toBe('1,234');
  });
});

describe('resolveProofStat', () => {
  it('makes inclusive latency claims at exact rounding boundaries', () => {
    expect(
      resolveProofStat(stat('profile_ttfb_ms'), observation(70), PUBLIC)
    ).toMatchObject({
      state: 'publishable',
      sentence: 'Profiles start responding within 70 ms',
    });
  });

  it('publishes a fresh public count over threshold', () => {
    const resolved = resolveProofStat(
      stat('accounts_total'),
      observation(104_211),
      PUBLIC
    );
    expect(resolved.state).toBe('publishable');
    expect(resolved.sentence).toBe('Trusted by 100k+ artists and teams');
  });

  it('hides below threshold and offers the fallback', () => {
    const resolved = resolveProofStat(
      stat('accounts_total'),
      observation(12),
      PUBLIC
    );
    expect(resolved).toMatchObject({
      state: 'below-threshold',
      value: null,
      sentence: null,
      fallback: 'Built for artists and the teams behind them',
    });
  });

  it('hides a stale value instead of showing it', () => {
    const definition = stat('accounts_total');
    const old = observation(500_000, definition.freshnessSlaHours + 1);
    expect(resolveProofStat(definition, old, PUBLIC).state).toBe('stale');
  });

  it('treats a future timestamp and a missing value as not publishable', () => {
    const definition = stat('accounts_total');
    expect(
      resolveProofStat(definition, observation(5000, -2), PUBLIC).state
    ).toBe('stale');
    expect(resolveProofStat(definition, null, PUBLIC).state).toBe('missing');
  });

  it('never renders an internal stat on a public surface', () => {
    const definition = stat('eng_merges_per_day');
    expect(resolveProofStat(definition, observation(40), PUBLIC).state).toBe(
      'internal'
    );
  });

  it('holds proposed stats back', () => {
    const definition = stat('security_open_critical');
    expect(resolveProofStat(definition, observation(0), PUBLIC).state).toBe(
      'not-live'
    );
  });

  it('withholds a lower-is-better stat over its ceiling', () => {
    const definition = stat('profile_ttfb_ms');
    expect(
      resolveProofStat(definition, observation(63.1, 24), PUBLIC)
    ).toMatchObject({
      state: 'publishable',
      sentence: 'Profiles start responding within 70 ms',
    });
    expect(
      resolveProofStat(definition, observation(450, 24), PUBLIC).state
    ).toBe('above-ceiling');
  });

  it('requires founder approval for comparative claims', () => {
    const definition = { ...stat('profile_lcp_rank'), status: 'live' as const };
    expect(resolveProofStat(definition, observation(2, 24), PUBLIC).state).toBe(
      'unapproved'
    );
    const approved = observation(2, 24, {
      approval: { cardId: 'card_123', approvedAt: NOW.toISOString() },
    });
    expect(resolveProofStat(definition, approved, PUBLIC).state).toBe(
      'publishable'
    );
  });
});

describe('renderBoundCopy', () => {
  const resolve = (value: number) => (id: string) =>
    getProofStat(id)
      ? resolveProofStat(stat(id), observation(value), PUBLIC)
      : null;

  it('fills value and sentence bindings when publishable', () => {
    expect(
      renderBoundCopy('Join {stat:accounts_total} artists', resolve(25_000))
    ).toEqual({ ok: true, text: 'Join 20k+ artists' });
    expect(
      renderBoundCopy('{stat:accounts_total.sentence}', resolve(25_000))
    ).toEqual({ ok: true, text: 'Trusted by 20k+ artists and teams' });
  });

  it('withholds the whole line when any binding cannot render', () => {
    expect(
      renderBoundCopy('Join {stat:accounts_total} artists', resolve(50))
    ).toEqual({
      ok: false,
      fallback: 'Built for artists and the teams behind them',
      blockedBy: ['accounts_total'],
    });
    expect(renderBoundCopy('{stat:not_a_stat}', resolve(50))).toMatchObject({
      ok: false,
      fallback: null,
    });
  });
});

describe('milestones', () => {
  const ladder = [1, 10, 100, 1000, 10_000, 100_000];
  it('reports each milestone crossed exactly once', () => {
    expect(crossedMilestones(ladder, 99_000, 100_400)).toEqual([100_000]);
    expect(crossedMilestones(ladder, null, 12)).toEqual([1, 10]);
    expect(crossedMilestones(ladder, 100_000, 100_500)).toEqual([]);
    expect(crossedMilestones(ladder, 120, 90)).toEqual([]);
  });
});

describe('registry and record', () => {
  it('parses, and every public stat has a methodology link', () => {
    for (const definition of listProofStats()) {
      if (definition.visibility === 'public') {
        expect(definition.methodology, definition.id).toMatch(
          /^\/proof\/methodology#/
        );
      }
    }
  });

  it('rejects a comparative stat with no gating claim and duplicate ids', () => {
    const base = {
      schema: 'jovie.proof-stats.registry/v1',
      rule: 'r',
      milestones: [1],
    };
    const comparative = {
      ...stat('profile_lcp_rank'),
      source: { ...stat('profile_lcp_rank').source, claim: undefined },
    };
    expect(
      proofStatRegistrySchema.safeParse({ ...base, stats: [comparative] })
        .success
    ).toBe(false);
    const dup = stat('accounts_total');
    expect(
      proofStatRegistrySchema.safeParse({ ...base, stats: [dup, dup] }).success
    ).toBe(false);
  });

  it('validates records against the registry', () => {
    expect(
      validateProofStatsRecord({
        schemaVersion: 1,
        observations: {
          ghost: observation(1),
          agent_path_cert: observation(13),
          accounts_total: observation(5, 1, {
            approval: { cardId: 'card_1', approvedAt: NOW.toISOString() },
          }),
        },
        publishable: [],
        events: [],
      })
    ).toEqual([
      'observations.ghost: not in the proof-stat registry',
      'observations.agent_path_cert: a ratio must be between 0 and 1',
      'observations.accounts_total: plain claims carry no approval; only comparative and health claims do',
    ]);
    expect(PROOF_STATS_KIND.apiWritable).toBe(false);
    expect(PROOF_STATS_KIND.defaultRecord('observations').observations).toEqual(
      {}
    );
  });

  it('measures loop health', () => {
    const metrics = computeProofStatsMetrics(
      {
        observations: {
          accounts_total: observation(104_000),
          artists_claimed: observation(3),
          smart_links_total: observation(5000, 500),
        },
      },
      NOW
    );
    expect(metrics.published).toBe(1);
    expect(metrics.belowThreshold).toBe(1);
    expect(metrics.stale).toBe(1);
    expect(metrics.total).toBe(listProofStats().length);
  });
});
