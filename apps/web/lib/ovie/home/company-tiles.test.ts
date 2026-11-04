import { describe, expect, it } from 'vitest';
import type { HudOverviewMetrics } from '@/types/hud';
import { buildCompanyTiles } from './company-tiles';

const OVERVIEW: HudOverviewMetrics = {
  mrrUsd: 0,
  activeSubscribers: 0,
  balanceUsd: 22.96,
  burnRateUsd: 110,
  runwayMonths: 0.2087,
  defaultStatus: 'dead',
  defaultStatusDetail: 'Revenue growth is not yet outpacing burn.',
  financialDataAvailable: true,
  weekAgo: { mrrUsd: 0, activeSubscribers: 0 },
};

const flow = (state: string, runtime: string) => ({
  domain: 'flows',
  state,
  tiers: { runtime_dogfood: runtime },
});

describe('buildCompanyTiles', () => {
  it('answers "are we winning" from the live company reads', () => {
    const byKey = Object.fromEntries(
      buildCompanyTiles({
        overview: OVERVIEW,
        funnel: {
          stages: [
            { key: 'accounts_created', count: 4, drillDownHref: '/x' },
            { key: 'onboarding_complete', count: 1, drillDownHref: null },
          ],
        },
        goldenPath: [
          flow('working', 'passed'),
          flow('working', 'passed'),
          { domain: 'marketing', state: 'shipped', tiers: {} },
        ],
      }).map(tile => [tile.key, tile])
    );
    expect(byKey.runway).toMatchObject({
      value: '6 days',
      tone: 'bad',
      target: 'Default dead · $23 cash',
    });
    expect(byKey.mrr).toMatchObject({
      value: '$0',
      was: '$0 7d ago',
      tone: 'bad',
    });
    expect(byKey.users).toMatchObject({
      value: '4',
      target: '1 reached first value',
      href: '/x',
      tone: 'good',
    });
    expect(byKey['golden-path']).toMatchObject({
      value: '2 of 2 pass in prod',
      target: '0 of 2 founder-certified',
      tone: 'warn',
    });
  });

  it('marks a failing production golden path bad', () => {
    const golden = buildCompanyTiles({
      overview: null,
      funnel: null,
      goldenPath: [flow('working', 'failed'), flow('shipped', 'passed')],
    }).find(tile => tile.key === 'golden-path');
    expect(golden).toMatchObject({ value: '1 of 2 pass in prod', tone: 'bad' });
  });

  it('never shows stub finance or a missing source as a real number', () => {
    const tiles = buildCompanyTiles({
      overview: { ...OVERVIEW, financialDataAvailable: false },
      funnel: null,
      goldenPath: null,
    });
    for (const tile of tiles) {
      expect(tile.measured).toBe(false);
      expect(tile.value).toBe('Not measured');
      expect(tile.tone).toBe('neutral');
    }
  });
});
