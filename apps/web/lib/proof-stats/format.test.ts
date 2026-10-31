import { describe, expect, it } from 'vitest';
import { PROOF_STATS_KIND, validateProofStatsRecord } from './content-kind';
import {
  crossedMilestones,
  formatProofValue as format,
  type ProofStatObservation,
  renderBoundCopy,
  resolveProofStat,
  roundConservative as round,
} from './format';
import { computeProofStatsMetrics } from './metrics';
import {
  getProofStat,
  listProofStats,
  type ProofStatDefinition,
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
    expect(round(12_345, rounding)).toBe(10_000);
    expect(round(199_999, rounding)).toBe(100_000);
    expect(round(100_000, rounding)).toBe(100_000);
    expect(round(0, rounding)).toBe(0);
  });
  it('ceils lower-is-better values to a step', () => {
    expect(round(63.1, { mode: 'ceil', step: 10 })).toBe(70);
    expect(round(70, { mode: 'ceil', step: 10 })).toBe(70);
    expect(round(0.29, { mode: 'floor', step: 0.01 })).toBe(0.29);
  });
  it('formats compact counts with + only when below the true value', () => {
    const rounding = {
      mode: 'floor' as const,
      sigDigits: 1,
      suffix: '+',
      compact: true,
    };
    expect(format(100_000, rounding)).toBe('100k');
    expect(format(123_456, rounding)).toBe('100k+');
    expect(format(1_999_999, rounding)).toBe('1M+');
    expect(format(12, rounding)).toBe('10+');
    expect(format(0.4242, { mode: 'floor', step: 0.01, percent: true })).toBe(
      '42%'
    );
    expect(format(1234, { mode: 'exact' })).toBe('1,234');
  });
});
describe('resolveProofStat', () => {
  const resolve = (id: string, value: ProofStatObservation | null) =>
    resolveProofStat(stat(id), value, PUBLIC);
  it('publishes a fresh public count over threshold', () => {
    expect(resolve('accounts_total', observation(104_211))).toMatchObject({
      state: 'publishable',
      sentence: 'Trusted by 100k+ artists and teams',
    });
  });
  it('hides below threshold and offers the fallback', () => {
    expect(resolve('accounts_total', observation(12))).toMatchObject({
      state: 'below-threshold',
      value: null,
      sentence: null,
      fallback: 'Built for artists and the teams behind them',
    });
  });
  it.each([
    [
      'accounts_total',
      observation(500_000, stat('accounts_total').freshnessSlaHours + 1),
      'stale',
    ],
    ['accounts_total', observation(5000, -2), 'stale'],
    ['accounts_total', null, 'missing'],
    ['eng_merges_per_day', observation(40), 'internal'],
    ['security_open_critical', observation(0), 'not-live'],
    ['profile_ttfb_ms', observation(450, 24), 'above-ceiling'],
  ] as const)('resolves %s to %s', (id, value, expected) => {
    expect(resolve(id, value).state).toBe(expected);
  });
  it('rounds a publishable lower-is-better stat conservatively', () => {
    expect(resolve('profile_ttfb_ms', observation(63.1, 24))).toMatchObject({
      state: 'publishable',
      sentence: 'Profiles start responding in under 70 ms',
    });
  });
  it.each([false, true])(
    'requires founder approval (approved=%s)',
    approved => {
      const definition = {
        ...stat('profile_lcp_rank'),
        status: 'live' as const,
      };
      const approval = approved
        ? { cardId: 'card_123', approvedAt: NOW.toISOString() }
        : null;
      const value = observation(2, 24, { approval });
      expect(resolveProofStat(definition, value, PUBLIC).state).toBe(
        approved ? 'publishable' : 'unapproved'
      );
    }
  );
});
describe('renderBoundCopy', () => {
  const resolve = (value: number) => (id: string) =>
    getProofStat(id)
      ? resolveProofStat(stat(id), observation(value), PUBLIC)
      : null;
  it.each([
    ['Join {stat:accounts_total} artists', 'Join 20k+ artists'],
    ['{stat:accounts_total.sentence}', 'Trusted by 20k+ artists and teams'],
  ])('fills %s', (template, text) => {
    expect(renderBoundCopy(template, resolve(25_000))).toEqual({
      ok: true,
      text,
    });
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
