import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import type { CompanyBlocker } from './company-blocker';
import { buildCompanyTiles } from './company-tiles';
import { buildPulse } from './shipping-home';
import {
  buildStoryFirstBottleneck,
  buildStoryFirstGlance,
  buildStoryFirstStages,
} from './story-first';

function count(value: number) {
  return { state: 'measured-nonzero' as const, value };
}

describe('buildStoryFirstGlance', () => {
  it('builds three pulses from shipping + company reads', () => {
    const delivery = {
      ...emptyDeliverySummary(),
      merges: {
        ...emptyDeliverySummary().merges,
        last7Days: count(98),
        prior7Days: count(70),
      },
    };
    const company = buildCompanyTiles({
      overview: {
        mrrUsd: 12400,
        activeSubscribers: 40,
        balanceUsd: 100_000,
        burnRateUsd: 10_000,
        runwayMonths: 10,
        defaultStatus: 'alive',
        defaultStatusDetail: '',
        financialDataAvailable: true,
        weekAgo: { mrrUsd: 12000, activeSubscribers: 38 },
      },
      funnel: {
        stages: [{ key: 'accounts_created', count: 248, drillDownHref: null }],
      },
      goldenPath: null,
    });
    const glance = buildStoryFirstGlance({
      delivery,
      company,
      shippingPulse: buildPulse(delivery),
    });
    expect(glance.map(pulse => pulse.key)).toEqual([
      'shipping',
      'revenue',
      'users',
    ]);
    expect(glance[0]).toMatchObject({
      value: '14',
      delta: '+4',
      measured: true,
      points: [10, 14],
      trend: 'up',
    });
    expect(glance[1]).toMatchObject({
      value: '$12,400',
      delta: 'alive',
      measured: true,
      trend: 'up',
    });
    expect(glance[2]).toMatchObject({
      value: '248',
      measured: true,
    });
    expect(glance[2]?.href).toBe(APP_ROUTES.ADMIN_GROWTH);
  });

  it('does not label $0 MRR with no prior as alive', () => {
    const company = buildCompanyTiles({
      overview: {
        mrrUsd: 0,
        activeSubscribers: 0,
        balanceUsd: 1000,
        burnRateUsd: 100,
        runwayMonths: 10,
        defaultStatus: 'alive',
        defaultStatusDetail: '',
        financialDataAvailable: true,
      },
      funnel: null,
      goldenPath: null,
    });
    const glance = buildStoryFirstGlance({
      delivery: emptyDeliverySummary(),
      company,
      shippingPulse: buildPulse(emptyDeliverySummary()),
    });
    expect(glance[1]).toMatchObject({
      value: '$0',
      delta: null,
      tone: 'bad',
    });
  });
});

describe('buildStoryFirstBottleneck', () => {
  const checkout: CompanyBlocker = {
    schema: 'jovie.company-blocker/v1',
    id: 'certification:checkout_payment_entitlement',
    kind: 'certification',
    step: 'checkout_payment_entitlement',
    tone: 'bad',
    text: 'Checkout fails certification, so nobody can pay yet',
    detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
    since: '2026-11-18T00:00:00.000Z',
    nextAction: 'Certify payment path',
    observedAt: '2026-11-21T00:00:00.000Z',
  };

  it('names the revenue blocker as the hero story', () => {
    const story = buildStoryFirstBottleneck({
      revenue: checkout,
      revenueRead: true,
      constraint: { tone: 'bad', text: checkout.text },
      highlight: {
        identifier: 'JOV-13192',
        title: 'Checkout cert',
        href: null,
      },
    });
    expect(story).toMatchObject({
      tone: 'bad',
      eyebrow: 'Bottleneck · Checkout',
      title: 'Checkout is blocking revenue',
      needs: 'Certify payment path',
      since: 'Nov 18',
      moving: { label: 'JOV-13192 · Checkout cert' },
    });
  });

  it('keeps funnel title distinct from the measured body', () => {
    const funnel: CompanyBlocker = {
      schema: 'jovie.company-blocker/v1',
      id: 'funnel:claim_attempted',
      kind: 'funnel',
      step: 'claim_attempted',
      tone: 'bad',
      text: '12 claim prompts shown this week, but no claim attempts',
      detailsHref: APP_ROUTES.ADMIN_GROWTH,
      since: null,
      nextAction: null,
      observedAt: '2026-11-21T00:00:00.000Z',
    };
    const story = buildStoryFirstBottleneck({
      revenue: funnel,
      revenueRead: true,
      constraint: { tone: 'bad', text: funnel.text },
      highlight: null,
    });
    expect(story.title).toBe('Claim Attempted is blocking revenue');
    expect(story.body).toBe(funnel.text);
    expect(story.title).not.toBe(story.body);
  });

  it('reads clear when revenue and shipping are quiet', () => {
    const story = buildStoryFirstBottleneck({
      revenue: null,
      revenueRead: true,
      constraint: null,
      highlight: null,
    });
    expect(story.tone).toBe('clear');
    expect(story.title).toBe('Nothing is blocking revenue');
  });

  it('stays loading until revenue reads', () => {
    expect(
      buildStoryFirstBottleneck({
        revenue: null,
        revenueRead: false,
        constraint: null,
        highlight: null,
      }).tone
    ).toBe('loading');
  });

  it('falls to the shipping floor when revenue read fails', () => {
    const story = buildStoryFirstBottleneck({
      revenue: null,
      revenueRead: true,
      revenueFailed: true,
      constraint: { tone: 'warn', text: 'JOV-1 is stuck in review' },
      highlight: null,
    });
    expect(story).toMatchObject({
      tone: 'warn',
      eyebrow: 'Bottleneck · Shipping',
      title: 'JOV-1 is stuck in review',
      body: 'Revenue state is unavailable; shipping needs attention.',
    });
  });

  it('never reads clear when revenue failed with no shipping floor', () => {
    expect(
      buildStoryFirstBottleneck({
        revenue: null,
        revenueRead: true,
        revenueFailed: true,
        constraint: null,
        highlight: null,
      }).tone
    ).toBe('unknown');
  });
});

describe('buildStoryFirstStages', () => {
  it('counts stages and highlights the lead row only', () => {
    const { buckets, highlight } = buildStoryFirstStages([
      {
        id: '1',
        identifier: 'JOV-8017',
        title: 'Sidebar geometry',
        url: null,
        stage: 'building',
        stageIndex: 1,
        complete: false,
        attention: null,
        updatedAt: null,
      },
      {
        id: '2',
        identifier: 'JOV-2',
        title: 'Other',
        url: null,
        stage: 'investigating',
        stageIndex: 0,
        complete: false,
        attention: null,
        updatedAt: null,
      },
    ]);
    expect(highlight).toEqual({
      identifier: 'JOV-8017',
      title: 'Sidebar geometry',
      href: null,
    });
    expect(buckets.find(b => b.stage === 'building')).toMatchObject({
      count: 1,
      highlight: {
        identifier: 'JOV-8017',
        title: 'Sidebar geometry',
      },
    });
    expect(
      buckets.find(b => b.stage === 'investigating')?.highlight
    ).toBeNull();
    expect(buckets.find(b => b.stage === 'tested')?.label).toBe('Review');
  });

  it('folds deployed work into the merging bucket', () => {
    const { buckets } = buildStoryFirstStages([
      {
        id: '1',
        identifier: 'JOV-9',
        title: 'Landed',
        url: null,
        stage: 'deployed',
        stageIndex: 4,
        complete: false,
        attention: null,
        updatedAt: null,
      },
    ]);
    expect(buckets.find(b => b.stage === 'merging')?.count).toBe(1);
    expect(
      buckets.find(b => b.stage === 'merging')?.highlight?.identifier
    ).toBe('JOV-9');
  });
});
