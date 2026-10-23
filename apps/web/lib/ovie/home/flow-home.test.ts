import { describe, expect, it } from 'vitest';
import {
  type DeliveryFlow,
  type DeliverySummary,
  emptyDeliverySummary,
  type StageSummary,
} from '@/lib/ovie/shipping-state/contract';
import { buildStageStrip } from './flow-home';
import { buildPulse } from './shipping-home';

const FLOW: DeliveryFlow = {
  openPrs: 98,
  redPrs: 22,
  dirtyPrs: 7,
  cleanNotQueued: 6,
  exhaustedPrs: 11,
  mergesPerHour: 3.6,
  queueEjectionRate: 0.72,
  queueWaitP95Seconds: 10471,
  productionLagP95Seconds: 527997,
  eligiblePool: 3,
  candidatePool: 31,
  ownerless: 2,
  regressions: ['merge_queue.wait.p95', 'merge_queue.ejection_rate'],
  at: '2026-10-21T12:56:29.000Z',
};

const SUMMARY: StageSummary = {
  at: '2026-10-21T12:00:00.000Z',
  stagesTotal: 31,
  stagesWithData: 14,
  regressions: ['remediation:red->green.p95'],
  slowestP95: [{ stage: 'shipping:queued', p50: 60, p95: 3600, n: 9 }],
  endToEnd7d: [
    {
      pipeline: 'shipping:pr-open->merged',
      p50: 2280,
      p95: 102600,
      n: 571,
      regressed: false,
    },
    {
      pipeline: 'remediation:red->green',
      p50: 3420,
      p95: 259560,
      n: 156,
      regressed: true,
    },
    { pipeline: 'release:x->y', p50: null, p95: null, n: 0, regressed: false },
  ],
};

function withLanes(lanes: Partial<DeliverySummary['lanes']>): DeliverySummary {
  const empty = emptyDeliverySummary();
  return { ...empty, lanes: { ...empty.lanes, ...lanes } };
}

describe('buildStageStrip', () => {
  it('lists end-to-end spans, then flow p95s and regressions', () => {
    const strip = buildStageStrip(
      withLanes({ stageSummary: SUMMARY, flow: FLOW })
    );
    expect(
      strip.items.map(item => [item.label, item.value, item.tone])
    ).toEqual([
      ['Shipping · PR Open → Merged', '38m / 29h', 'neutral'],
      ['Remediation · Red → Green', '57m / 3.0d', 'bad'],
      ['Queue Wait P95', '2.9h', 'bad'],
      ['Prod Lag P95', '6.1d', 'warn'],
      ['SLO Regressions', '2', 'bad'],
    ]);
    expect(strip.coverage).toBe('14 of 31 stages measured');
  });

  it('marks Prod Lag P95 bad when the merged-to-verified SLO regressed', () => {
    const toneOf = (seconds: number) => {
      const strip = buildStageStrip(
        withLanes({
          flow: {
            ...FLOW,
            productionLagP95Seconds: seconds,
            regressions: [
              ...FLOW.regressions,
              'production_lag.merged_to_verified.p95',
            ],
          },
        })
      );
      return strip.items.find(item => item.id === 'flow:prod-lag')?.tone;
    };

    // Under and over the one-day warn threshold both stay bad once regressed.
    expect(toneOf(3600)).toBe('bad');
    expect(toneOf(527997)).toBe('bad');
  });

  it('falls back to the slowest stages when no span is published', () => {
    const strip = buildStageStrip(
      withLanes({ stageSummary: { ...SUMMARY, endToEnd7d: [] }, flow: null })
    );
    expect(strip.items).toEqual([
      {
        id: 'stage:shipping:queued',
        label: 'Shipping · Queued P95',
        value: '1.0h',
        tone: 'neutral',
      },
    ]);
  });

  it('says stage events are unpublished rather than showing zeros', () => {
    expect(buildStageStrip(emptyDeliverySummary())).toEqual({
      items: [],
      coverage: 'Stage events not published yet',
    });
  });
});

describe('flow pulse tiles', () => {
  it('reads merges per hour, queue ejections, red PRs, eligible and ownerless', () => {
    const byKey = Object.fromEntries(
      buildPulse(withLanes({ flow: FLOW })).map(tile => [tile.key, tile])
    );
    expect(byKey['merges-hour']).toMatchObject({ value: '3.6', tone: 'good' });
    expect(byKey.queue).toMatchObject({
      label: 'Queue · 72% ejected',
      tone: 'bad',
    });
    expect(byKey['red-prs']).toMatchObject({ value: '22/98', tone: 'warn' });
    expect(byKey.eligible).toMatchObject({ value: '3/31', tone: 'good' });
    expect(byKey.ownerless).toMatchObject({ value: '2', tone: 'bad' });
  });
});
