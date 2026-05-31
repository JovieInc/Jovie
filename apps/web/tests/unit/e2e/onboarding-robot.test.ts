import { describe, expect, it } from 'vitest';
import {
  isOnboardingFunnelEvent,
  ONBOARDING_FUNNEL_EVENT_NAMES,
  ONBOARDING_FUNNEL_EVENTS,
} from '@/lib/onboarding/funnel-events';
import {
  assertOnboardingRobotCleanupTarget,
  buildOnboardingRobotHandle,
  buildOnboardingRobotRunId,
  isLocalOnboardingRobotEmail,
  isProductionOnboardingRobotEmail,
} from '@/tests/e2e/helpers/onboarding-robot';

describe('onboarding funnel event contract', () => {
  it('exposes the v1 onboarding robot event names', () => {
    expect(ONBOARDING_FUNNEL_EVENT_NAMES).toEqual([
      'onboarding_started',
      'auth_completed',
      'chat_started',
      'chat_completed',
      'qualified',
      'waitlisted',
      'profile_created',
      'dashboard_loaded',
    ]);
  });

  it('validates event names without accepting arbitrary analytics events', () => {
    expect(isOnboardingFunnelEvent(ONBOARDING_FUNNEL_EVENTS.CHAT_STARTED)).toBe(
      true
    );
    expect(isOnboardingFunnelEvent('checkout_redirect')).toBe(false);
  });
});

describe('onboarding robot guardrails', () => {
  it('builds scoped run ids and handles', () => {
    const runId = buildOnboardingRobotRunId('JOV-2681 robot run');
    const handle = buildOnboardingRobotHandle(runId, 'user_31ABCDEF');

    expect(runId).toBe('or-jov-2681-robot-run');
    expect(handle).toMatch(/^jor[a-z0-9]+$/);
    expect(handle.length).toBeLessThanOrEqual(30);
  });

  it('recognizes only local onboarding robot test emails', () => {
    expect(
      isLocalOnboardingRobotEmail('gp-or-jov-2681+clerk_test@test.jovie.com')
    ).toBe(true);
    expect(
      isLocalOnboardingRobotEmail('gp-other+clerk_test@test.jovie.com')
    ).toBe(false);
  });

  it('recognizes only production plus-addressed robot emails', () => {
    expect(
      isProductionOnboardingRobotEmail(
        'test-google+onboarding-robot-or-jov-2681@jov.ie',
        'test-google@jov.ie'
      )
    ).toBe(true);
    expect(
      isProductionOnboardingRobotEmail(
        'test-google+unrelated@jov.ie',
        'test-google@jov.ie'
      )
    ).toBe(false);
  });

  it('allows exact robot cleanup targets', () => {
    expect(() =>
      assertOnboardingRobotCleanupTarget(
        {
          clerkUserId: 'user_31ABCDEF',
          email: 'gp-or-jov-2681+clerk_test@test.jovie.com',
          handle: 'jorjov2681abcdef',
          runId: 'or-jov-2681',
        },
        {}
      )
    ).not.toThrow();
  });

  it('refuses broad or human-looking cleanup targets', () => {
    expect(() =>
      assertOnboardingRobotCleanupTarget(
        {
          clerkUserId: 'user_31ABCDEF',
          email: 'tim@jov.ie',
          handle: 'tim',
          runId: 'manual',
        },
        { E2E_PROD_SIGNUP_EMAIL_BASE: 'test-google@jov.ie' }
      )
    ).toThrow(/Refusing to clean up non-robot onboarding email/);
  });
});
