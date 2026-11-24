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
  issueLabel,
  plainTitle,
  stripIssueId,
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
      value: '98',
      delta: '+28',
      measured: true,
      points: [70, 98],
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
      trend: 'flat',
    });
  });

  it('keeps flat sparkline when equal MRR has real prior history', () => {
    const company = buildCompanyTiles({
      overview: {
        mrrUsd: 4200,
        activeSubscribers: 12,
        balanceUsd: 50_000,
        burnRateUsd: 5_000,
        runwayMonths: 10,
        defaultStatus: 'alive',
        defaultStatusDetail: '',
        financialDataAvailable: true,
        weekAgo: { mrrUsd: 4200, activeSubscribers: 12 },
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
      delta: 'flat',
      points: [4200, 4200],
      trend: 'flat',
    });
  });

  it('paints sparkline from tone when MRR has no prior series', () => {
    const company = buildCompanyTiles({
      overview: {
        mrrUsd: 4200,
        activeSubscribers: 12,
        balanceUsd: 50_000,
        burnRateUsd: 5_000,
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
      delta: 'alive',
      tone: 'good',
      points: [4200, 4200],
      trend: 'up',
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
    text: 'The latest available certification report for checkout shows a failed check. See Certifications for details.',
    detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
    since: '2026-11-18T00:00:00.000Z',
    nextAction: 'Certify payment path',
    observedAt: '2026-11-21T00:00:00.000Z',
  };

  it('names checkout certification as the hero story and links its evidence', () => {
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
      eyebrow: 'Certification · Checkout',
      title: 'Checkout certification needs attention',
      body: checkout.text,
      detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
      needs: 'Certify payment path',
      since: 'Nov 18',
      moving: { label: 'Checkout cert' },
    });
  });

  it.each([
    ['homepage_entry', 'Homepage', 'Homepage entry'],
    ['onboarding_auth_claim', 'Claim', 'Sign-up and claim'],
    ['activation_dashboard', 'Activation', 'First use after paying'],
  ] as const)('names %s as a certification issue', (step, eyebrow, name) => {
    const story = buildStoryFirstBottleneck({
      revenue: { ...checkout, id: `certification:${step}`, step },
      revenueRead: true,
      constraint: null,
      highlight: null,
    });
    expect(story).toMatchObject({
      eyebrow: `Certification · ${eyebrow}`,
      title: `${name} certification needs attention`,
    });
  });

  const row = (identifier: string, title: string, complete = false) => ({
    id: identifier,
    identifier,
    title,
    url: null,
    stage: 'building' as const,
    stageIndex: 1,
    complete,
    attention: null,
    updatedAt: null,
  });

  it('links only shipping work on the blocker as Moving', () => {
    const lanes = row(
      'JOV-10172',
      'feat(lanes): gem-default worktree hosts, fallback cap'
    );
    const unrelated = buildStoryFirstBottleneck({
      revenue: checkout,
      revenueRead: true,
      constraint: null,
      highlight: {
        identifier: lanes.identifier,
        title: lanes.title,
        href: null,
      },
      rows: [lanes],
    });
    expect(unrelated.moving).toBeNull();
    const related = buildStoryFirstBottleneck({
      revenue: checkout,
      revenueRead: true,
      constraint: null,
      highlight: {
        identifier: lanes.identifier,
        title: lanes.title,
        href: null,
      },
      rows: [
        lanes,
        row('JOV-1', 'Stripe checkout copy', true),
        row('JOV-2', 'fix(billing): success page receipt'),
      ],
    });
    expect(related.moving).toEqual({
      label: 'Success page receipt',
      href: null,
    });
  });

  it.each([
    ['homepage_entry', 'Polish homepage navigation'],
    ['visits', 'Improve landing page navigation'],
    ['eligible_entries', 'Improve eligible-entry navigation'],
  ] as const)('links entry work in shipping order for %s', (step, title) => {
    const sentry = row('JOV-3', 'Fix Sentry error grouping');
    const completed = row('JOV-4', 'Update homepage copy', true);
    const entry = row('JOV-5', title);
    const later = row('JOV-6', 'Tidy landing page copy');
    const moving = (rows: ReturnType<typeof row>[]) =>
      buildStoryFirstBottleneck({
        revenue: { ...checkout, step },
        revenueRead: true,
        constraint: null,
        highlight: null,
        rows,
      }).moving;

    expect([
      moving([sentry]),
      moving([sentry, completed, entry, later]),
    ]).toEqual([null, { label: title, href: null }]);
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
    expect(story.detailsHref).toBe(APP_ROUTES.ADMIN_GROWTH);
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
    expect(buckets.map(b => b.stage)).toEqual([
      'investigating',
      'building',
      'tested',
      'merging',
    ]);
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

describe('issue id de-duplication', () => {
  it('strips a trailing (ID) that repeats the identifier', () => {
    expect(
      issueLabel('JOV-10172', 'feat(lanes): split lanes (JOV-10172)')
    ).toBe('Split lanes');
  });

  it('reads as a plain title: no issue key, no commit prefix', () => {
    expect(
      plainTitle(
        'JOV-10172',
        'JOV-10172 feat(lanes): gem-default worktree hosts'
      )
    ).toBe('Gem-default worktree hosts');
    expect(plainTitle('', 'fix!: drop the cache')).toBe('Drop the cache');
    expect(plainTitle('JOV-1', 'Checkout copy')).toBe('Checkout copy');
    expect(plainTitle('JOV-1', 'feat: ')).toBe('feat:');
  });

  it('strips a leading "ID: " and leaves other titles alone', () => {
    expect(stripIssueId('JOV-1', 'JOV-1: fix it')).toBe('fix it');
    expect(stripIssueId('JOV-1', 'fix it (JOV-2)')).toBe('fix it (JOV-2)');
  });
});
