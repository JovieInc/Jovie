import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postJsonBeacon } = vi.hoisted(() => ({ postJsonBeacon: vi.fn() }));
vi.mock('@/lib/tracking/json-beacon', () => ({ postJsonBeacon }));

const {
  advanceFunnelClock,
  consumeSignupFirstValue,
  forwardAnalyticsEventToFunnel,
  markSignupFirstValuePending,
  resetFunnelClockForTests,
  SIGNUP_FUNNEL_BEACON_ENDPOINT,
} = await import('./signup-funnel-client');

/** Beacon payloads without the anonymous timing fields. */
const sent = () =>
  postJsonBeacon.mock.calls.map(call => {
    const { stepMs: _stepMs, entryMs: _entryMs, ...rest } = call[1];
    return rest;
  });

describe('signup funnel client', () => {
  beforeEach(() => {
    postJsonBeacon.mockReset();
    globalThis.localStorage.clear();
    resetFunnelClockForTests();
  });

  it('times each step from the previous one and from session entry', () => {
    const t0 = 1_000_000;
    expect(advanceFunnelClock(t0)).toEqual({});
    expect(advanceFunnelClock(t0 + 4_000)).toEqual({
      stepMs: 4_000,
      entryMs: 4_000,
    });
    expect(advanceFunnelClock(t0 + 10_500)).toEqual({
      stepMs: 6_500,
      entryMs: 10_500,
    });
  });

  it('starts a new session clock after a long idle gap', () => {
    const t0 = 1_000_000;
    advanceFunnelClock(t0);
    expect(advanceFunnelClock(t0 + 31 * 60_000)).toEqual({});
    expect(advanceFunnelClock(t0 + 31 * 60_000 + 2_000)).toEqual({
      stepMs: 2_000,
      entryMs: 2_000,
    });
  });

  it('sends timing on the beacon from the second step on, never an id', () => {
    forwardAnalyticsEventToFunnel('onboarding_started');
    forwardAnalyticsEventToFunnel('chat_started');
    const [first, second] = postJsonBeacon.mock.calls.map(call => call[1]);
    expect(first).not.toHaveProperty('stepMs');
    expect(second.stepMs).toBeGreaterThanOrEqual(0);
    expect(second.entryMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(second).sort()).toEqual(
      ['entryMs', 'funnel', 'stepMs', 'step', 'surface'].sort()
    );
  });

  it('maps existing onboarding events onto funnel steps', () => {
    forwardAnalyticsEventToFunnel('onboarding_started');
    forwardAnalyticsEventToFunnel('chat_completed');
    forwardAnalyticsEventToFunnel('waitlist_decision_rendered');
    forwardAnalyticsEventToFunnel('profile_view');

    expect(postJsonBeacon.mock.calls[0][0]).toBe(SIGNUP_FUNNEL_BEACON_ENDPOINT);
    expect(sent()).toEqual([
      {
        funnel: 'artist_signup',
        step: 'onboarding_started',
        surface: 'onboarding',
      },
      {
        funnel: 'artist_signup',
        step: 'chat_completed',
        surface: 'onboarding',
      },
      {
        funnel: 'artist_signup',
        step: 'qualified',
        outcome: 'dropped',
        surface: 'onboarding',
        reason: 'waitlist',
      },
    ]);
  });

  it('counts a fan CTA click only for the subscribe flow, not manage', () => {
    forwardAnalyticsEventToFunnel('alert_cta_click', { flow_origin: 'manage' });
    forwardAnalyticsEventToFunnel('alert_cta_click', {
      flow_origin: 'subscribe',
    });
    expect(sent()).toEqual([
      { funnel: 'fan_subscribe', step: 'cta_click', surface: 'profile' },
    ]);
  });

  it('fires first_value once, and only after a claim in this browser', () => {
    consumeSignupFirstValue();
    expect(postJsonBeacon).not.toHaveBeenCalled();

    markSignupFirstValuePending();
    consumeSignupFirstValue();
    consumeSignupFirstValue();
    expect(sent()).toEqual([
      { funnel: 'artist_signup', step: 'first_value', surface: 'dashboard' },
    ]);
  });

  it('never throws when the transport throws', () => {
    postJsonBeacon.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => forwardAnalyticsEventToFunnel('chat_started')).not.toThrow();
  });
});
