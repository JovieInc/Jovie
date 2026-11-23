import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import type { CompanyBlocker } from './company-blocker';
import { buildCompanyTiles } from './company-tiles';
import { buildPulse } from './shipping-home';
import {
  buildStoryFirstBottleneck,
  buildStoryFirstGlance,
} from './story-first';

function count(value: number) {
  return { state: 'measured-nonzero' as const, value };
}

describe('Home never asserts an unproven block', () => {
  const profile: CompanyBlocker = {
    schema: 'jovie.company-blocker/v1',
    id: 'certification:public_profile',
    kind: 'certification',
    step: 'public_profile',
    tone: 'warn',
    text: "The public profile isn't fully measured yet, so we can't confirm an artist can be sent their profile",
    detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
    since: null,
    nextAction: null,
    observedAt: '2026-11-22T00:00:00.000Z',
  };

  it('says it cannot see the bottleneck when the step is only unmeasured', () => {
    const story = buildStoryFirstBottleneck({
      revenue: profile,
      revenueRead: true,
      constraint: null,
      highlight: null,
      rows: [],
    });
    expect(story.title).toBe("We can't see the bottleneck yet");
    expect(story.title).not.toMatch(/blocking/);
    expect(story.body).toContain("isn't fully measured yet");
    expect(story.tone).toBe('unknown');
    expect(story.eyebrow).toBe('Not measured · Profile');
  });

  it('still names the block when the evidence proves it', () => {
    const story = buildStoryFirstBottleneck({
      revenue: {
        ...profile,
        tone: 'bad',
        text: 'The public profile fails certification, so no artist can be sent their profile yet',
      },
      revenueRead: true,
      constraint: null,
      highlight: null,
      rows: [],
    });
    expect(story.title).toBe('The public profile is blocking revenue');
  });

  it('does not call a dashboard query fix work on the public profile', () => {
    const story = buildStoryFirstBottleneck({
      revenue: profile,
      revenueRead: true,
      constraint: null,
      highlight: null,
      rows: [
        {
          id: 'a',
          identifier: 'JOV-8651',
          title: 'fix(dashboard): await profile query cancellation',
          url: null,
          stage: 'building',
          stageIndex: 1,
          complete: false,
          attention: null,
          updatedAt: null,
        },
      ],
    });
    expect(story.moving).toBeNull();
  });
});

describe('Home shipping pulse tells the truth', () => {
  it('shows the real 7-day merge count, not a per-day average', () => {
    const delivery = {
      ...emptyDeliverySummary(),
      merges: {
        ...emptyDeliverySummary().merges,
        last7Days: count(212),
        prior7Days: count(180),
      },
    };
    const [shipping] = buildStoryFirstGlance({
      delivery,
      company: buildCompanyTiles({
        overview: null,
        funnel: null,
        goldenPath: null,
      }),
      shippingPulse: buildPulse(delivery),
    });
    expect(shipping).toMatchObject({
      value: '212',
      delta: '+32',
      measured: true,
      reason: null,
    });
  });

  it('gives a reason when the merge count is not measured', () => {
    const [shipping, revenue, users] = buildStoryFirstGlance({
      delivery: emptyDeliverySummary(),
      company: buildCompanyTiles({
        overview: null,
        funnel: null,
        goldenPath: null,
      }),
      shippingPulse: buildPulse(emptyDeliverySummary()),
    });
    expect(shipping).toMatchObject({ value: 'Not measured', measured: false });
    expect(shipping.reason).toMatch(/merge count/);
    expect(revenue.reason).toMatch(/Stripe/);
    expect(users.reason).toMatch(/funnel/);
  });

  it('shows no flat label for a $0 that never moved', () => {
    const company = buildCompanyTiles({
      overview: {
        mrrUsd: 0,
        activeSubscribers: 0,
        balanceUsd: 0,
        burnRateUsd: 0,
        runwayMonths: null,
        defaultStatus: 'unknown',
        defaultStatusDetail: '',
        financialDataAvailable: false,
        mrrAvailable: true,
        weekAgo: { mrrUsd: 0, activeSubscribers: 0 },
      } as never,
      funnel: null,
      goldenPath: null,
    });
    const glance = buildStoryFirstGlance({
      delivery: null,
      company,
      shippingPulse: [],
    });
    expect(glance[1]).toMatchObject({
      value: '$0',
      delta: null,
      measured: true,
    });
  });
});
