import { describe, expect, it } from 'vitest';
import {
  AI_VISIBILITY_MEASUREMENT_CONTRACT,
  AI_VISIBILITY_METRIC_CATALOG,
  assertSingleAiVisibilityLayer,
  buildAiVisibilityMeasurement,
  getAiVisibilityMetric,
  layerForAiVisibilityMetric,
  requireMeasuredAiVisibilityMetric,
  summarizeAiVisibilityLayers,
} from './visibility-measurement';

describe('AI visibility measurement layers', () => {
  it('pins every catalog metric to exactly one layer', () => {
    expect(layerForAiVisibilityMetric('profile_published')).toBe('readiness');
    expect(layerForAiVisibilityMetric('ai_crawlers_allowed')).toBe('readiness');
    expect(layerForAiVisibilityMetric('brand_integrity_ready')).toBe(
      'readiness'
    );
    expect(layerForAiVisibilityMetric('crawler_reads')).toBe(
      'observed_visibility'
    );
    expect(layerForAiVisibilityMetric('weekly_crawler_reads')).toBe(
      'observed_visibility'
    );
    expect(layerForAiVisibilityMetric('citation_appearance_rate')).toBe(
      'observed_visibility'
    );
    expect(layerForAiVisibilityMetric('answer_rank')).toBe(
      'observed_visibility'
    );
    expect(layerForAiVisibilityMetric('attributed_gmv_cents')).toBe(
      'business_outcome'
    );
    expect(layerForAiVisibilityMetric('paid_conversions')).toBe(
      'business_outcome'
    );

    const layers = new Set(
      Object.values(AI_VISIBILITY_METRIC_CATALOG).map(item => item.layer)
    );
    expect([...layers].sort()).toEqual([
      'business_outcome',
      'observed_visibility',
      'readiness',
    ]);
  });

  it('keeps omitted inputs unmeasured instead of inventing a blended score', () => {
    const measurement = buildAiVisibilityMeasurement();
    expect(measurement.contract).toBe(AI_VISIBILITY_MEASUREMENT_CONTRACT);
    expect(
      measurement.readiness.every(item => item.status === 'unmeasured')
    ).toBe(true);
    expect(
      measurement.observedVisibility.every(item => item.status === 'unmeasured')
    ).toBe(true);
    expect(
      measurement.businessOutcome.every(item => item.status === 'unmeasured')
    ).toBe(true);
    expect(measurement).not.toHaveProperty('score');
    expect(summarizeAiVisibilityLayers(measurement)).toEqual({
      contract: AI_VISIBILITY_MEASUREMENT_CONTRACT,
      readiness: 'unmeasured',
      observedVisibility: 'unmeasured',
      businessOutcome: 'unmeasured',
    });
  });

  it('records crawler reads as observed visibility without claiming readiness or outcome', () => {
    const measurement = buildAiVisibilityMeasurement({
      observed: { crawlerReads: 12, weeklyCrawlerReads: 3 },
    });
    const reads = requireMeasuredAiVisibilityMetric(
      measurement,
      'crawler_reads',
      'observed_visibility'
    );
    const weekly = requireMeasuredAiVisibilityMetric(
      measurement,
      'weekly_crawler_reads',
      'observed_visibility'
    );

    expect(reads.value).toBe(12);
    expect(weekly.value).toBe(3);
    expect(getAiVisibilityMetric(measurement, 'profile_published').status).toBe(
      'unmeasured'
    );
    expect(
      getAiVisibilityMetric(measurement, 'attributed_gmv_cents').status
    ).toBe('unmeasured');
    expect(summarizeAiVisibilityLayers(measurement)).toMatchObject({
      readiness: 'unmeasured',
      observedVisibility: 'observed',
      businessOutcome: 'unmeasured',
    });
  });

  it('treats zero observed reads as collecting, not as a business outcome', () => {
    const measurement = buildAiVisibilityMeasurement({
      observed: { crawlerReads: 0, weeklyCrawlerReads: 0 },
    });
    expect(summarizeAiVisibilityLayers(measurement).observedVisibility).toBe(
      'collecting'
    );
    expect(summarizeAiVisibilityLayers(measurement).businessOutcome).toBe(
      'unmeasured'
    );
  });

  it('keeps readiness flags out of observed and outcome buckets', () => {
    const measurement = buildAiVisibilityMeasurement({
      readiness: {
        profilePublished: true,
        aiCrawlersAllowed: false,
        brandIntegrityReady: true,
      },
      outcome: { attributedGmvCents: 2500, paidConversions: 1 },
    });

    expect(
      measurement.readiness.map(item => [item.key, item.layer, item.value])
    ).toEqual([
      ['profile_published', 'readiness', true],
      ['ai_crawlers_allowed', 'readiness', false],
      ['brand_integrity_ready', 'readiness', true],
    ]);
    expect(
      measurement.businessOutcome.map(item => [
        item.key,
        item.layer,
        item.value,
      ])
    ).toEqual([
      ['attributed_gmv_cents', 'business_outcome', 2500],
      ['paid_conversions', 'business_outcome', 1],
    ]);
    expect(summarizeAiVisibilityLayers(measurement)).toMatchObject({
      readiness: 'not_ready',
      observedVisibility: 'unmeasured',
      businessOutcome: 'attributed',
    });
  });

  it('refuses to treat mixed-layer metrics as one score', () => {
    const measurement = buildAiVisibilityMeasurement({
      readiness: { profilePublished: true },
      observed: { crawlerReads: 9 },
      outcome: { paidConversions: 2 },
    });

    expect(() =>
      assertSingleAiVisibilityLayer([
        getAiVisibilityMetric(measurement, 'profile_published'),
        getAiVisibilityMetric(measurement, 'crawler_reads'),
      ])
    ).toThrow('ai_visibility_layers_must_remain_distinct');
    expect(() =>
      requireMeasuredAiVisibilityMetric(
        measurement,
        'crawler_reads',
        'readiness'
      )
    ).toThrow('ai_visibility_metric_layer_mismatch');
    expect(() =>
      requireMeasuredAiVisibilityMetric(
        measurement,
        'paid_conversions',
        'observed_visibility'
      )
    ).toThrow('ai_visibility_metric_layer_mismatch');
  });
});
