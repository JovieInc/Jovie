import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postJsonBeacon } = vi.hoisted(() => ({ postJsonBeacon: vi.fn() }));
vi.mock('@/lib/tracking/json-beacon', () => ({ postJsonBeacon }));

const {
  consumeSignupFirstValue,
  forwardAnalyticsEventToFunnel,
  markSignupFirstValuePending,
  SIGNUP_FUNNEL_BEACON_ENDPOINT,
} = await import('./signup-funnel-client');

const sent = () => postJsonBeacon.mock.calls.map(call => call[1]);

describe('signup funnel client', () => {
  beforeEach(() => {
    postJsonBeacon.mockReset();
    globalThis.localStorage.clear();
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
