import { describe, expect, it } from 'vitest';
import { buildMetricReceipt, resolveEvidenceWindow } from './evidence-receipt';
import {
  assessFunnelRate,
  type FunnelReceiptStage,
} from './funnel-receipt-eligibility';

const now = new Date('2026-10-26T12:00:00.000Z');
const window = resolveEvidenceWindow(now, new Date('2026-10-19T12:00:00.000Z'));
const policy = {
  audience: 'customer' as const,
  profileId: 'synthetic-profile',
  now,
  maxAgeMs: 60_000,
  minimumDenominator: 20,
};
function stage(value: number, population: string): FunnelReceiptStage {
  return {
    access: 'customer',
    sourceState: 'available',
    cohort: 'synthetic-cohort',
    population,
    receipt: buildMetricReceipt(
      {
        metric: 'unique_users',
        value,
        grain: 'member_snapshot',
        availability: value === 0 ? 'measured_zero' : 'measured',
      },
      { profileId: policy.profileId, rangeEnd: now, computedAt: now },
      window
    ),
  };
}
const nesting = {
  parentPopulation: 'entered',
  childPopulation: 'completed',
  cohort: 'synthetic-cohort',
  evidenceRef: 'synthetic-membership-receipt',
  window,
  asOf: now.toISOString(),
};
function receiptStage(
  overrides: Partial<NonNullable<FunnelReceiptStage['receipt']>>
) {
  const result = stage(5, 'completed');
  return { ...result, receipt: { ...result.receipt!, ...overrides } };
}
const assess = (
  after = stage(5, 'completed'),
  before = stage(100, 'entered')
) => assessFunnelRate(before, after, nesting, policy);

describe('funnel receipt eligibility', () => {
  it('uses canonical percent math only for measured nested populations', () => {
    expect(assess()).toEqual({
      eligible: true,
      percent: 5,
      availability: 'measured',
      actionability: 'investigate',
    });
  });
  it('preserves a real zero without claiming a rate for an empty cohort', () => {
    expect(assess(stage(0, 'completed'))).toMatchObject({
      eligible: true,
      percent: 0,
      availability: 'measured_zero',
    });
    expect(assess(stage(0, 'completed'), stage(0, 'entered'))).toEqual({
      eligible: false,
      reason: 'empty_denominator',
    });
  });
  it.each(['missing', 'failed'] as const)(
    'distinguishes %s sources from measured zero',
    sourceState => {
      expect(assess({ ...stage(0, 'completed'), sourceState })).toEqual({
        eligible: false,
        reason: sourceState,
      });
    }
  );
  it.each([
    ['unavailable', 'unavailable'],
    ['partial_data', 'partial_data'],
    ['not_yet_mature', 'insufficient_sample'],
  ] as const)('preserves %s evidence', (availability, reason) => {
    expect(assess(receiptStage({ availability }))).toEqual({
      eligible: false,
      reason,
    });
  });
  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid count %s', value => {
    expect(assess(receiptStage({ value }))).toEqual({
      eligible: false,
      reason: 'invalid_count',
    });
  });
  it('rejects malformed counts arriving across a JSON boundary', () => {
    expect(assess(receiptStage({ value: '5' as unknown as number }))).toEqual({
      eligible: false,
      reason: 'invalid_count',
    });
  });
  it('does not treat small samples or non-nested counts as a conversion failure', () => {
    expect(assess(stage(0, 'completed'), stage(10, 'entered'))).toEqual({
      eligible: false,
      reason: 'insufficient_sample',
    });
    expect(assess(stage(101, 'completed'))).toEqual({
      eligible: false,
      reason: 'population_not_nested',
    });
    expect(
      assessFunnelRate(
        stage(100, 'entered'),
        stage(5, 'completed'),
        null,
        policy
      )
    ).toEqual({ eligible: false, reason: 'population_not_nested' });
  });
  it('requires nesting evidence bound to these populations and cohort', () => {
    for (const change of [
      { parentPopulation: 'elsewhere' },
      { childPopulation: 'elsewhere' },
      { cohort: 'elsewhere' },
      { evidenceRef: '' },
    ]) {
      expect(
        assessFunnelRate(
          stage(100, 'entered'),
          stage(5, 'completed'),
          { ...nesting, ...change },
          policy
        )
      ).toEqual({ eligible: false, reason: 'population_not_nested' });
    }
  });
  it('does not mix anonymous events and people', () => {
    const events = buildMetricReceipt(
      {
        metric: 'total_clicks',
        value: 5,
        grain: 'event',
        availability: 'measured',
      },
      { profileId: policy.profileId, rangeEnd: now, computedAt: now },
      window
    );
    expect(assess({ ...stage(5, 'completed'), receipt: events })).toEqual({
      eligible: false,
      reason: 'incompatible',
    });
  });
  it('rejects mismatched cohorts and windows', () => {
    expect(assess({ ...stage(5, 'completed'), cohort: 'other' })).toEqual({
      eligible: false,
      reason: 'incompatible',
    });
    expect(
      assess(receiptStage({ window: { ...window, start: null, hours: null } }))
    ).toEqual({ eligible: false, reason: 'incompatible' });
  });
  it.each(['invalid', '2026-02-30T12:00:00.000Z', '2026-10-27T12:00:00.000Z'])(
    'rejects invalid or future freshness %s',
    as_of => {
      expect(assess(receiptStage({ as_of }))).toEqual({
        eligible: false,
        reason: 'invalid_freshness',
      });
    }
  );
  it('rejects future compute times and reporting windows', () => {
    expect(
      assess(receiptStage({ computed_at: '2026-10-27T12:00:00.000Z' }))
    ).toEqual({ eligible: false, reason: 'invalid_freshness' });
    expect(
      assess(
        receiptStage({ window: { ...window, end: '2026-10-27T12:00:00.000Z' } })
      )
    ).toEqual({ eligible: false, reason: 'invalid_freshness' });
  });
  it('does not make a cached receipt fresh when checked again', () => {
    const cached = receiptStage({ from_cache: true });
    expect(assess(cached)).toMatchObject({ eligible: true });
    expect(
      assessFunnelRate(stage(100, 'entered'), cached, nesting, {
        ...policy,
        now: new Date(now.getTime() + 60_001),
      })
    ).toEqual({ eligible: false, reason: 'stale' });
    expect(cached.receipt?.computed_at).toBe(now.toISOString());
  });
  it('returns no metric or source health to a mismatched customer scope', () => {
    const internal = { ...stage(100, 'entered'), access: 'internal' as const };
    expect(
      assess({ ...stage(5, 'completed'), sourceState: 'failed' }, internal)
    ).toEqual({ eligible: false, reason: 'scope_mismatch' });
    expect(
      assess(receiptStage({ scope: { profileId: 'another-profile' } }))
    ).toEqual({ eligible: false, reason: 'scope_mismatch' });
  });
  it('allows authorized internal consumption without changing the receipt', () => {
    expect(
      assessFunnelRate(
        { ...stage(100, 'entered'), access: 'internal' },
        stage(5, 'completed'),
        nesting,
        { ...policy, audience: 'internal' }
      )
    ).toMatchObject({ eligible: true });
  });
  it('rejects a forged unit or old definition instead of relabeling it', () => {
    expect(assess(receiptStage({ unit: 'events' }))).toEqual({
      eligible: false,
      reason: 'invalid_receipt',
    });
    expect(assess(receiptStage({ definition_version: 'old' }))).toEqual({
      eligible: false,
      reason: 'invalid_receipt',
    });
  });
  it('rejects partial limitations, invalid policy and stale nesting evidence', () => {
    expect(assess(receiptStage({ limitations: ['partial_source'] }))).toEqual({
      eligible: false,
      reason: 'unavailable',
    });
    expect(
      assessFunnelRate(stage(100, 'entered'), stage(5, 'completed'), nesting, {
        ...policy,
        minimumDenominator: 0,
      })
    ).toEqual({ eligible: false, reason: 'invalid_receipt' });
    expect(
      assessFunnelRate(
        stage(100, 'entered'),
        stage(5, 'completed'),
        { ...nesting, asOf: '2026-10-25T12:00:00.000Z' },
        policy
      )
    ).toEqual({ eligible: false, reason: 'population_not_nested' });
  });
});
