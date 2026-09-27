import { describe, expect, it } from 'vitest';
import {
  assertCreatorOutcomeMetricLayer,
  assertSingleCreatorOutcomeLayer,
  assertVerifiedMoneyExcludesProxies,
  buildCreatorOutcomeMeasurement,
  CREATOR_OUTCOME_CONTRACT,
  CREATOR_OUTCOME_METRIC_CATALOG,
  describeCreatorWorkOutcome,
  layerForCreatorOutcomeMetric,
  outcomeWindowDays,
  presentCreatorOutcomeDashboard,
  resolveCausalVerifiedMoneyLift,
} from './creator-outcomes';

describe('creator outcome layers', () => {
  it('pins every catalog metric to exactly one layer', () => {
    expect(layerForCreatorOutcomeMetric('verified_gmv_cents')).toBe(
      'verified_money'
    );
    expect(layerForCreatorOutcomeMetric('verified_tips_cents')).toBe(
      'verified_money'
    );
    expect(layerForCreatorOutcomeMetric('attributed_clicks')).toBe(
      'attributed_engagement'
    );
    expect(layerForCreatorOutcomeMetric('attributed_dsp_clicks')).toBe(
      'attributed_engagement'
    );
    expect(layerForCreatorOutcomeMetric('attributed_new_fans')).toBe(
      'attributed_engagement'
    );
    expect(
      layerForCreatorOutcomeMetric('causal_verified_money_lift_cents')
    ).toBe('causal_lift');

    const layers = new Set(
      Object.values(CREATOR_OUTCOME_METRIC_CATALOG).map(item => item.layer)
    );
    expect([...layers].sort()).toEqual([
      'attributed_engagement',
      'causal_lift',
      'verified_money',
    ]);
  });

  it('keeps omitted inputs unmeasured and causal lift inconclusive', () => {
    const measurement = buildCreatorOutcomeMeasurement();
    expect(measurement.contract).toBe(CREATOR_OUTCOME_CONTRACT);
    expect(
      measurement.verifiedMoney.every(item => item.status === 'unmeasured')
    ).toBe(true);
    expect(
      measurement.attributedEngagement.every(
        item => item.status === 'unmeasured'
      )
    ).toBe(true);
    expect(measurement.causalLift[0]?.status).toBe('inconclusive');
    expect(measurement.causalLift[0]?.value).toBeNull();
    expect(measurement).not.toHaveProperty('score');
  });

  it('does not turn attributed listens or fans into verified money', () => {
    const measurement = buildCreatorOutcomeMeasurement({
      attributedDspClicks: 40,
      attributedNewFans: 3,
    });
    const listens = measurement.attributedEngagement.find(
      item => item.key === 'attributed_dsp_clicks'
    );
    expect(listens?.status).toBe('measured');
    expect(listens?.value).toBe(40);
    expect(
      measurement.verifiedMoney.every(item => item.status === 'unmeasured')
    ).toBe(true);
    expect(measurement.causalLift[0]?.status).toBe('inconclusive');
    expect(() =>
      assertCreatorOutcomeMetricLayer(
        measurement.attributedEngagement[1]!,
        'verified_money'
      )
    ).toThrow('creator_outcome_metric_layer_mismatch');
  });

  it('refuses to treat mixed-layer metrics as one score', () => {
    const measurement = buildCreatorOutcomeMeasurement({
      verifiedGmvCents: 1800,
      attributedClicks: 12,
      causalVerifiedMoneyLiftCents: 500,
      causalStatus: 'measured',
    });

    expect(() =>
      assertSingleCreatorOutcomeLayer([
        measurement.verifiedMoney[0]!,
        measurement.attributedEngagement[0]!,
      ])
    ).toThrow('creator_outcome_layers_must_remain_distinct');
    expect(() =>
      assertVerifiedMoneyExcludesProxies({
        verifiedMoneyCents: 2050,
        blendedSignalCents: 2050,
        engagementProxyCents: 250,
      })
    ).toThrow('creator_outcome_verified_money_includes_proxy');
    expect(() =>
      assertVerifiedMoneyExcludesProxies({
        verifiedMoneyCents: 1800,
        blendedSignalCents: 2050,
        engagementProxyCents: 250,
      })
    ).not.toThrow();
  });

  it('computes causal lift only from verified money on a comparable window', () => {
    const start = new Date('2026-06-01T00:00:00.000Z');
    const end = new Date('2026-07-01T00:00:00.000Z');
    expect(outcomeWindowDays(start, end)).toBe(30);

    expect(
      resolveCausalVerifiedMoneyLift({
        currentGmvCents: 3000,
        currentTipsCents: 800,
        baselineGmvCents: 1000,
        baselineTipsCents: 200,
        windowDays: 30,
        baselineWindowDays: 30,
      })
    ).toEqual({ cents: 2600, status: 'measured' });

    expect(
      resolveCausalVerifiedMoneyLift({
        currentGmvCents: 3000,
        currentTipsCents: 0,
        baselineGmvCents: 1000,
        baselineTipsCents: 0,
        windowDays: 14,
        baselineWindowDays: 30,
      })
    ).toEqual({ cents: null, status: 'inconclusive' });

    expect(
      resolveCausalVerifiedMoneyLift({
        currentGmvCents: null,
        currentTipsCents: null,
        baselineGmvCents: 1000,
        baselineTipsCents: 0,
        windowDays: 30,
        baselineWindowDays: 30,
      })
    ).toEqual({ cents: null, status: 'unmeasured' });
  });

  it('presents the three claims separately on the dashboard', () => {
    const presentation = presentCreatorOutcomeDashboard({
      verifiedGmvCents: 12500,
      verifiedTipsCents: null,
      attributedDspClicks: 40,
      attributedNewFans: 2,
      causalVerifiedMoneyLiftCents: 4000,
      causalStatus: 'measured',
    });

    expect(presentation.layers.map(layer => layer.label)).toEqual([
      'Verified money',
      'Attributed engagement',
      'Causal lift',
    ]);
    expect(presentation.layers[0]).toMatchObject({
      valueLabel: '$125.00',
      status: 'measured',
    });
    expect(presentation.layers[0]?.disclosure).toContain('Tips are unmeasured');
    expect(presentation.layers[1]?.valueLabel).toBe('40 listens · 2 fans');
    expect(presentation.layers[2]).toMatchObject({
      valueLabel: '$40.00',
      status: 'measured',
    });
    expect(presentation.layers[2]?.disclosure).not.toContain('proxy');
  });

  it('keeps a release work row from calling engagement causal lift', () => {
    const lines = describeCreatorWorkOutcome({
      gmvDeltaCents: 1800,
      clickDelta: 12,
      dspClickDelta: 0,
      newFansDelta: 3,
    });

    expect(lines.verifiedMoneyValue).toBe('$18.00');
    expect(lines.engagementValue).toBe('12 clicks · 3 fans');
    expect(lines.causalLiftValue).toBe('Inconclusive');
    expect(lines.causalLiftDisclosure).toContain('comparable baseline');
  });
});
