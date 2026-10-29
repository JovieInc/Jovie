import { describe, expect, it } from 'vitest';
import {
  allocateSends,
  type ColdInbox,
  type ControllerGates,
  hasApprovalRecord,
  planColdSends,
  planInbox,
  RAMP_STEPS,
  WARMUP_DAYS,
} from './controller';

const NOW = new Date('2026-11-30T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const OPEN: ControllerGates = {
  coldDomainConfigured: true,
  coldDomainOnCore: false,
  mailingAddressSet: true,
  providerConfigured: true,
  dispatchAllowed: true,
  globalPause: false,
  onboardingDogfoodPassed: true,
};

function inbox(overrides: Partial<ColdInbox> = {}): ColdInbox {
  return {
    id: 'tim@meetjovie.com',
    domain: 'meetjovie.com',
    warmupStartedAt: daysAgo(WARMUP_DAYS + 10),
    rampStep: 0,
    paused: false,
    lastWeek: { sent: 35, bounced: 0, complained: 0, replied: 3 },
    baselineReplyRate: 0.08,
    sentToday: 0,
    ...overrides,
  };
}

describe('planInbox', () => {
  it('sends nothing while warming', () => {
    const { plan } = planInbox(
      inbox({ warmupStartedAt: daysAgo(3), rampStep: null }),
      NOW
    );
    expect(plan).toMatchObject({ action: 'warming', cap: 0 });
  });

  it('ramps one step on a healthy week', () => {
    const { plan } = planInbox(inbox(), NOW);
    expect(plan).toMatchObject({
      action: 'ramp_up',
      nextRampStep: 1,
      cap: RAMP_STEPS[0],
    });
  });

  it('holds without enough sends to judge, or when replies fall', () => {
    expect(
      planInbox(
        inbox({
          lastWeek: { sent: 10, bounced: 0, complained: 0, replied: 1 },
        }),
        NOW
      ).plan.action
    ).toBe('hold');
    expect(
      planInbox(
        inbox({
          lastWeek: { sent: 40, bounced: 0, complained: 0, replied: 0 },
        }),
        NOW
      ).plan.action
    ).toBe('hold');
  });

  it('holds at 2% bounce and pauses at the 3% ceiling with an incident', () => {
    expect(
      planInbox(
        inbox({
          lastWeek: { sent: 100, bounced: 2, complained: 0, replied: 8 },
        }),
        NOW
      ).plan.action
    ).toBe('hold');
    const paused = planInbox(
      inbox({ lastWeek: { sent: 100, bounced: 3, complained: 0, replied: 8 } }),
      NOW
    );
    expect(paused.plan.action).toBe('pause');
    expect(paused.incident).toMatchObject({ kind: 'bounce_breach' });
  });

  it('pauses on any spam complaint even on a small sample', () => {
    const paused = planInbox(
      inbox({ lastWeek: { sent: 5, bounced: 0, complained: 1, replied: 0 } }),
      NOW
    );
    expect(paused.plan.action).toBe('pause');
    expect(paused.incident?.kind).toBe('complaint_breach');
  });
});

describe('planColdSends', () => {
  it('is blocked with zero budget while any gate is closed (today)', () => {
    const plan = planColdSends({
      gates: {
        ...OPEN,
        coldDomainConfigured: false,
        mailingAddressSet: false,
        providerConfigured: false,
        dispatchAllowed: false,
        onboardingDogfoodPassed: false,
      },
      inboxes: [],
      dialTarget: 50,
      now: NOW,
    });
    expect(plan.state).toBe('blocked');
    expect(plan.budgetToday).toBe(0);
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        'cold_domain_missing',
        'mailing_address_missing',
        'provider_not_configured',
        'audience_delivery_disabled',
        'onboarding_not_dogfood_certified',
        'no_active_inbox',
      ])
    );
  });

  it('respects the dial as a ceiling, not a floor', () => {
    const inboxes = [
      inbox({ id: 'a', rampStep: 3 }),
      inbox({ id: 'b', rampStep: 3 }),
    ];
    expect(
      planColdSends({ gates: OPEN, inboxes, dialTarget: 12, now: NOW })
        .budgetToday
    ).toBe(12);
    expect(
      planColdSends({ gates: OPEN, inboxes, dialTarget: 500, now: NOW })
        .budgetToday
    ).toBe(40);
  });

  it('subtracts what already went out today', () => {
    const plan = planColdSends({
      gates: OPEN,
      inboxes: [inbox({ rampStep: 3, sentToday: 15 })],
      dialTarget: 30,
      now: NOW,
    });
    expect(plan.budgetToday).toBe(5);
  });

  it('pauses the whole domain on a pooled breach', () => {
    const plan = planColdSends({
      gates: OPEN,
      inboxes: [
        inbox({
          id: 'a',
          lastWeek: { sent: 50, bounced: 1, complained: 0, replied: 4 },
        }),
        inbox({
          id: 'b',
          lastWeek: { sent: 10, bounced: 1, complained: 0, replied: 1 },
        }),
        inbox({
          id: 'c',
          lastWeek: { sent: 10, bounced: 1, complained: 0, replied: 1 },
        }),
      ],
      dialTarget: 30,
      now: NOW,
    });
    expect(plan.incidents.some(i => i.scope === 'domain')).toBe(true);
    expect(plan.budgetToday).toBe(0);
  });

  it('Tim pause stops sends without hiding other blockers', () => {
    const plan = planColdSends({
      gates: { ...OPEN, globalPause: true },
      inboxes: [inbox()],
      dialTarget: 10,
      now: NOW,
    });
    expect(plan).toMatchObject({ state: 'paused', budgetToday: 0 });
  });
});

describe('allocateSends', () => {
  it('spreads the budget across inboxes', () => {
    const plan = planColdSends({
      gates: OPEN,
      inboxes: [
        inbox({ id: 'a', rampStep: 3 }),
        inbox({ id: 'b', rampStep: 3, sentToday: 10 }),
      ],
      dialTarget: 20,
      now: NOW,
    });
    const split = allocateSends(plan);
    expect([...split.values()].reduce((a, b) => a + b, 0)).toBe(10);
    expect(split.get('a')).toBeGreaterThan(0);
  });
});

describe('hasApprovalRecord', () => {
  const base = {
    leadId: 'l',
    segment: 's',
    copyRevision: 'rev-1',
    dogfoodPassed: true,
  };
  it('never admits a candidate whose page or onboarding failed the dogfood judge', () => {
    expect(
      hasApprovalRecord({
        ...base,
        dogfoodPassed: false,
        approval: {
          kind: 'founder',
          approvedRevision: 'rev-1',
          actorUserId: 'u',
        },
      })
    ).toBe(false);
  });

  it('requires a founder approval of the exact revision or an auto verdict', () => {
    expect(hasApprovalRecord({ ...base, approval: null })).toBe(false);
    expect(
      hasApprovalRecord({
        ...base,
        approval: {
          kind: 'founder',
          approvedRevision: 'rev-0',
          actorUserId: 'u',
        },
      })
    ).toBe(false);
    expect(
      hasApprovalRecord({
        ...base,
        approval: {
          kind: 'founder',
          approvedRevision: 'rev-1',
          actorUserId: 'u',
        },
      })
    ).toBe(true);
    expect(
      hasApprovalRecord({
        ...base,
        approval: { kind: 'auto', verdictMode: 'review' },
      })
    ).toBe(false);
    expect(
      hasApprovalRecord({
        ...base,
        approval: { kind: 'auto', verdictMode: 'auto' },
      })
    ).toBe(true);
  });
});
