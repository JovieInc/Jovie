import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  GUIDED_FIRST_USE_ROUTE,
  getPaidSuccessPrimaryHref,
  getPaidSuccessPrimaryLabel,
  resolveCheckoutSuccessView,
  shouldCelebratePaidSuccess,
} from './checkout-success-state';

describe('resolveCheckoutSuccessView', () => {
  it('blocks paid success until a session is verified or billing is already entitled', () => {
    const pending = resolveCheckoutSuccessView({
      checkoutSessionId: 'cs_test',
      isSessionPlanPending: true,
      validatedSessionPlan: null,
      billingPlan: 'pro',
      isBillingPending: false,
    });
    const failed = resolveCheckoutSuccessView({
      checkoutSessionId: 'cs_test',
      isSessionPlanPending: false,
      validatedSessionPlan: null,
      billingPlan: 'pro',
      isBillingPending: false,
    });
    expect(pending).toEqual({ kind: 'pending', reason: 'session' });
    expect(failed).toEqual({ kind: 'recovery', reason: 'session_unconfirmed' });
    expect(shouldCelebratePaidSuccess(failed)).toBe(false);
    expect(
      resolveCheckoutSuccessView({
        checkoutSessionId: 'cs_test',
        isSessionPlanPending: false,
        validatedSessionPlan: 'pro',
        billingPlan: null,
        isBillingPending: false,
      })
    ).toMatchObject({ kind: 'success', plan: 'pro' });
    expect(
      getPaidSuccessPrimaryHref({ plan: 'pro', isOnboardingUpgrade: false })
    ).toBe(GUIDED_FIRST_USE_ROUTE);
  });

  it('routes a paid buyer without a claimed profile to claim a link', () => {
    const input = {
      plan: 'pro' as const,
      isOnboardingUpgrade: false,
      needsProfile: true,
    };
    expect(getPaidSuccessPrimaryHref(input)).toBe(APP_ROUTES.START);
    expect(getPaidSuccessPrimaryLabel(input)).toBe('Claim your link');
  });

  it('lands every profile-ready paid buyer in the guided first use (JOV-9957)', () => {
    for (const isOnboardingUpgrade of [false, true]) {
      for (const plan of ['pro', 'trial', 'max'] as const) {
        const input = { plan, isOnboardingUpgrade, needsProfile: false };
        expect(getPaidSuccessPrimaryHref(input)).toBe(
          `${APP_ROUTES.CHAT}?from=onboarding`
        );
        expect(getPaidSuccessPrimaryLabel(input)).toBe('Start your first task');
      }
    }
  });
});
