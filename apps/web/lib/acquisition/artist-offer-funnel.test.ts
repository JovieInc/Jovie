import { describe, expect, it } from 'vitest';
import {
  ARTIST_OFFER_FUNNEL_STAGES,
  buildArtistOfferFunnelReport,
  isRecordedArtistOfferStage,
  percentile,
  stageForFunnelPath,
} from './artist-offer-funnel';

const t0 = new Date('2026-10-20T10:00:00.000Z');
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe('artist-offer funnel contract', () => {
  it('orders the seven stages with kebab-case stage-event ids', () => {
    expect(ARTIST_OFFER_FUNNEL_STAGES).toEqual([
      'visit',
      'pricing',
      'claim-start',
      'sign-in',
      'checkout',
      'paid',
      'profile-live',
    ]);
    for (const stage of ARTIST_OFFER_FUNNEL_STAGES) {
      expect(stage).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('only accepts producer-recorded stages; visit and sign-in are derived', () => {
    expect(isRecordedArtistOfferStage('paid')).toBe(true);
    expect(isRecordedArtistOfferStage('visit')).toBe(false);
    expect(isRecordedArtistOfferStage('sign-in')).toBe(false);
    expect(isRecordedArtistOfferStage('anything')).toBe(false);
  });

  it('maps only the pricing page to a page-view stage', () => {
    expect(stageForFunnelPath('/pricing')).toBe('pricing');
    expect(stageForFunnelPath('/pricing/?ref=x')).toBe('pricing');
    expect(stageForFunnelPath('/pricing-old')).toBeNull();
    expect(stageForFunnelPath('/')).toBeNull();
    expect(stageForFunnelPath(null)).toBeNull();
  });

  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it('reports counts, step conversion and p50/p95 timings', () => {
    const report = buildArtistOfferFunnelReport({
      start: t0,
      end: at(86_400),
      totalVisits: 10,
      timelines: [
        {
          visit: at(0),
          pricing: at(30),
          'claim-start': at(90),
          'sign-in': at(150),
          checkout: at(400),
          paid: at(460),
          'profile-live': at(470),
        },
        {
          visit: at(0),
          pricing: at(60),
          'claim-start': at(300),
          'sign-in': null,
        },
        // Clock skew (stage before its predecessor) is excluded from timing.
        { visit: at(100), pricing: at(50) },
        { visit: at(0), 'claim-start': at(20) },
      ],
    });

    const byStage = Object.fromEntries(
      report.stages.map(stage => [stage.stage, stage])
    );
    expect(report.scope).toBe('consented_first_party_journeys');
    expect(byStage.visit.journeys).toBe(10);
    expect(byStage.pricing).toMatchObject({
      journeys: 3,
      conversionFromPrevious: 0.3,
      conversionFromVisit: 0.3,
    });
    expect(byStage.pricing.fromPreviousSeconds).toEqual({
      samples: 2,
      p50: 30,
      p95: 60,
    });
    expect(byStage['claim-start'].journeys).toBe(3);
    expect(byStage.paid).toMatchObject({
      journeys: 1,
      conversionFromPrevious: 1,
      conversionFromVisit: 0.1,
    });
    expect(byStage.paid.fromPreviousSeconds.p50).toBe(60);
    expect(byStage['profile-live'].fromVisitSeconds).toEqual({
      samples: 1,
      p50: 470,
      p95: 470,
    });
  });

  it('returns null conversion with no visits instead of dividing by zero', () => {
    const report = buildArtistOfferFunnelReport({
      start: t0,
      end: at(1),
      totalVisits: 0,
      timelines: [],
    });
    expect(report.stages.every(stage => stage.journeys === 0)).toBe(true);
    expect(report.stages[1].conversionFromPrevious).toBeNull();
  });
});
