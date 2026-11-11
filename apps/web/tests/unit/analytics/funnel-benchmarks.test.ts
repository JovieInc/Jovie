import { describe, expect, it } from 'vitest';
import {
  compareStages,
  FUNNEL_STAGE_BENCHMARKS,
  funnelBenchmarkReport,
  MIN_STAGE_SAMPLE,
} from '@/lib/analytics/funnel-benchmarks';
import type {
  FunnelReport,
  SummerFunnelResponse,
} from '@/lib/analytics/signup-funnel.server';

function report(counts: Record<string, number>): FunnelReport {
  return {
    funnelId: 'artist_signup',
    steps: Object.entries(counts).map(([step, count]) => ({
      step,
      count,
      stepMsP50: null,
      stepMsP95: null,
      stepMsSamples: 0,
      conversionFromPrevious: null,
      errors: 0,
      dropped: 0,
      topReasons: [],
    })),
    overallConversion: null,
    bottleneck: { step: null, reason: 'no_data' },
  } as unknown as FunnelReport;
}

describe('funnel benchmarks', () => {
  it('cites a published source with a year for every stage', () => {
    for (const stage of FUNNEL_STAGE_BENCHMARKS) {
      expect(stage.sources.length).toBeGreaterThan(0);
      for (const source of stage.sources) {
        expect(source.url).toMatch(/^https:\/\//u);
        expect(source.year).toBeGreaterThanOrEqual(2022);
      }
      expect(stage.median).toBeGreaterThan(0);
      expect(stage.median).toBeLessThan(1);
    }
  });

  it('never judges a stage on fewer than the minimum sample', () => {
    const [visit] = compareStages(
      report({ landing_view: MIN_STAGE_SAMPLE - 1, auth_success: 0 })
    );
    expect(visit).toMatchObject({
      id: 'visit_to_signup',
      verdict: 'insufficient_sample',
      rate: null,
    });
  });

  it('holds activation to the higher of the median and Jovie target', () => {
    const stages = compareStages(
      report({ landing_view: 1000, auth_success: 100, first_value: 35 })
    );
    const activation = stages.find(s => s.id === 'signup_to_activation');
    // 35% beats the 30% industry median but not Jovie's 40% gate.
    expect(activation).toMatchObject({
      rate: 0.35,
      target: 0.4,
      verdict: 'below_benchmark',
    });
    expect(stages.find(s => s.id === 'visit_to_signup')).toMatchObject({
      rate: 0.1,
      verdict: 'at_or_above_benchmark',
    });
    expect(stages.find(s => s.id === 'free_to_paid')?.verdict).toBe(
      'not_in_funnel'
    );
  });

  it('names the first stage below target as the binding stage', () => {
    const funnel = {
      observedAt: '2026-11-08T00:00:00.000Z',
      windows: {
        '7d': {
          funnels: [
            report({ landing_view: 1000, auth_success: 20, first_value: 2 }),
          ],
        },
      },
    } as unknown as SummerFunnelResponse;
    const result = funnelBenchmarkReport(funnel);
    expect(result.bindingStage).toBe('visit_to_signup');
    expect(result.window).toBe('7d');
  });

  it('has no binding stage when nothing is measurable yet', () => {
    const funnel = {
      observedAt: '2026-11-08T00:00:00.000Z',
      windows: { '7d': { funnels: [] } },
    } as unknown as SummerFunnelResponse;
    const result = funnelBenchmarkReport(funnel);
    expect(result.bindingStage).toBeNull();
    expect(result.stages.map(s => s.verdict)).toEqual([
      'insufficient_sample',
      'insufficient_sample',
      'not_in_funnel',
    ]);
  });
});
