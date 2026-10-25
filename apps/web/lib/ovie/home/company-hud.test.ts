import { describe, expect, it } from 'vitest';
import type { DeliverySummary } from '@/lib/ovie/shipping-state/contract';
import type { HudMetrics } from '@/types/hud';
import {
  buildCompanyTiles,
  type CompanyFunnelInput,
  type CompanyInputs,
  weeklyGrowthPct,
} from './company-hud';

const overview = {
  mrrUsd: 0,
  activeSubscribers: 0,
  balanceUsd: 22.96,
  burnRateUsd: 110,
  runwayMonths: 0.2087,
  defaultStatus: 'dead',
  defaultStatusDetail: 'Revenue growth is not yet outpacing burn.',
  financialDataAvailable: true,
  weekAgo: { mrrUsd: 0, activeSubscribers: 0 },
} satisfies HudMetrics['overview'];

const funnel = {
  stages: [
    {
      key: 'chats',
      label: 'Onboarding chats',
      description: '',
      count: 3,
      conversionRate: null,
      dropOff: null,
      identifiable: false,
      drillDownHref: null,
    },
    {
      key: 'accounts',
      label: 'Accounts created',
      description: '',
      count: 1,
      conversionRate: 1 / 3,
      dropOff: 2,
      identifiable: true,
      drillDownHref: null,
    },
    {
      key: 'paid',
      label: 'Paid',
      description: '',
      count: 0,
      conversionRate: 0,
      dropOff: 1,
      identifiable: true,
      drillDownHref: null,
    },
  ],
  timeRange: '7d',
  biggestDropOffKey: 'accounts',
  errors: [],
  definitionVersion: 'founder-funnel.v2',
} as unknown as CompanyFunnelInput;

const count = (value: number) =>
  value === 0
    ? ({ state: 'measured-zero', value: 0 } as const)
    : ({ state: 'measured-nonzero', value } as const);

const delivery = {
  merges: { today: count(96), last7Days: count(400), prior7Days: count(320) },
} as unknown as DeliverySummary;

function inputs(overrides: Partial<CompanyInputs> = {}): CompanyInputs {
  return {
    overview,
    reliability: {
      incidents24h: 0,
      unresolvedSentryIssues24h: 4,
    } as HudMetrics['reliability'],
    funnel,
    delivery,
    verifiedToday: 12,
    fleet: {
      level: 'degraded',
      headline: 'x',
      reasons: ['Remediation alerts are not being acknowledged'],
      capacity: '3 of 4 lanes running',
    },
    openAsks: 9,
    nextDeadlineIso: '2026-10-25T05:00:00.000Z',
    nowMs: Date.parse('2026-10-25T03:00:00.000Z'),
    ...overrides,
  };
}

const byId = (tiles: ReturnType<typeof buildCompanyTiles>, id: string) =>
  tiles.find(tile => tile.id === id);

describe('buildCompanyTiles', () => {
  it('reads in YC order: survive, grow, convert, ship, run, decide', () => {
    expect(buildCompanyTiles(inputs()).map(tile => tile.id)).toEqual([
      'alive',
      'revenue',
      'funnel',
      'shipping',
      'fleet',
      'blocked',
    ]);
  });

  it('leads with the honest default-alive verdict from real cash and burn', () => {
    const alive = byId(buildCompanyTiles(inputs()), 'alive');
    expect(alive).toMatchObject({ value: 'Dead', tone: 'bad' });
    expect(alive?.line).toBe(
      '$22.96 cash · $110.00/mo burn · runway 0.2 months'
    );
  });

  it('never invents week-over-week growth without a baseline', () => {
    const revenue = byId(buildCompanyTiles(inputs()), 'revenue');
    expect(revenue?.line).toContain('no baseline week-over-week');
    expect(revenue?.tone).toBe('bad');
    expect(weeklyGrowthPct(10, 0)).toBeNull();
    expect(weeklyGrowthPct(110, 100)).toBeCloseTo(10);
  });

  it('colours growth against the 5 percent weekly target', () => {
    const good = byId(
      buildCompanyTiles(
        inputs({
          overview: {
            ...overview,
            mrrUsd: 106,
            weekAgo: { mrrUsd: 100, activeSubscribers: 1 },
          },
        })
      ),
      'revenue'
    );
    expect(good).toMatchObject({ value: '$106.00', tone: 'good' });
    expect(good?.line).toContain('+6.0% week over week');
    const slow = byId(
      buildCompanyTiles(
        inputs({
          overview: {
            ...overview,
            mrrUsd: 102,
            weekAgo: { mrrUsd: 100, activeSubscribers: 1 },
          },
        })
      ),
      'revenue'
    );
    expect(slow?.tone).toBe('warn');
  });

  it('names the biggest funnel leak and admits WAU is not measured', () => {
    const tile = byId(buildCompanyTiles(inputs()), 'funnel');
    expect(tile?.value).toBe('3 → 0');
    expect(tile?.line).toBe(
      'Biggest leak: Onboarding chats to Accounts created (−2)'
    );
    expect(tile?.details.at(-1)).toContain(
      'Weekly active users are not measured'
    );
  });

  it('counts verified outcomes and the 7-day trend', () => {
    const tile = byId(buildCompanyTiles(inputs()), 'shipping');
    expect(tile?.value).toBe('96');
    expect(tile?.line).toBe(
      'merges · 12 verified in production · +25% vs prior 7d'
    );
  });

  it('defines today once (Pacific midnight) on the tile', () => {
    expect(byId(buildCompanyTiles(inputs()), 'shipping')?.details).toContain(
      'Today is midnight to now, Pacific time.'
    );
  });

  it('says how long production has been behind main, and never invents it', () => {
    const NOW = Date.parse('2026-10-25T12:00:00.000Z');
    const withProduction = (production: unknown) =>
      byId(
        buildCompanyTiles(
          inputs({
            nowMs: NOW,
            delivery: { ...delivery, production } as never,
          })
        ),
        'shipping'
      )?.details ?? [];
    expect(
      withProduction({
        deployedAt: '2026-10-25T09:00:00.000Z',
        behindMain: { state: 'measured-nonzero', value: 5 },
      })
    ).toContain(
      'Production is 5 commits behind main since the last deploy 3h ago.'
    );
    expect(
      withProduction({
        deployedAt: null,
        behindMain: { state: 'measured-zero', value: 0 },
      })
    ).toContain('Production is on main.');
    expect(
      withProduction({ behindMain: { state: 'not-measured', value: null } })
    ).toContain('Production distance from main is not measured.');
  });

  it('shows no verified count when it was not measured, not a false zero', () => {
    const tile = byId(
      buildCompanyTiles(inputs({ verifiedToday: null })),
      'shipping'
    );
    expect(tile?.line).not.toContain('verified');
  });

  it('joins fleet verdict and production incidents in one line', () => {
    const tile = byId(buildCompanyTiles(inputs()), 'fleet');
    expect(tile).toMatchObject({ value: 'Degraded', tone: 'warn' });
    expect(tile?.line).toBe(
      '3 of 4 lanes running · 0 production incidents in 24h · 4 unresolved errors'
    );
  });

  it('shows the next default deadline on decisions', () => {
    expect(byId(buildCompanyTiles(inputs()), 'blocked')?.line).toBe(
      'next default in 2h'
    );
    expect(
      byId(buildCompanyTiles(inputs({ openAsks: 0 })), 'blocked')?.line
    ).toBe('Nothing needs your decision');
  });

  it('says Not measured for every missing source, never a calm default', () => {
    const tiles = buildCompanyTiles(
      inputs({
        overview: null,
        reliability: null,
        funnel: null,
        delivery: null,
        verifiedToday: null,
        fleet: null,
        openAsks: null,
      })
    );
    expect(
      tiles.every(tile => tile.value === 'Not measured' && !tile.measured)
    ).toBe(true);
  });
});
