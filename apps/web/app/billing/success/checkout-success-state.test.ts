import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  CHECKOUT_RETURN_FEATURE_ROUTES,
  CHECKOUT_SUCCESS_FOCUS_VALUE,
  CHECKOUT_SUCCESS_HOLD_MS,
  getCheckoutSuccessAnnouncement,
  getPaidSuccessPrimaryHref,
  getPaidSuccessPrimaryLabel,
  resolveCheckoutReturnFeature,
  resolveCheckoutSuccessView,
  shouldCelebratePaidSuccess,
  withHeadingFocusParam,
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
    ).toBe(APP_ROUTES.PRESENCE);
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
});

describe('checkout success moment (JOV-9035)', () => {
  it('returns the buyer to the allowlisted feature that triggered the upgrade, never /billing', () => {
    expect(resolveCheckoutReturnFeature('/app/chat')).toBe('/app/chat');
    expect(resolveCheckoutReturnFeature('/app')).toBe('/app');
    expect(resolveCheckoutReturnFeature('/app/presence')).toBe(
      APP_ROUTES.PRESENCE
    );

    // Unlisted values never reach the Stripe return URL: no arbitrary
    // redirects, no billing surface echo, no absolute URLs.
    expect(resolveCheckoutReturnFeature('/billing')).toBeNull();
    expect(resolveCheckoutReturnFeature('/billing/success')).toBeNull();
    expect(resolveCheckoutReturnFeature('https://evil.example')).toBeNull();
    expect(resolveCheckoutReturnFeature('')).toBeNull();
    expect(resolveCheckoutReturnFeature(null)).toBeNull();
    expect(CHECKOUT_RETURN_FEATURE_ROUTES.includes('/billing')).toBe(false);
  });

  it.each([undefined, 42, true, {}, [APP_ROUTES.CHAT]])(
    'rejects non-string checkout return input %j',
    from => {
      expect(resolveCheckoutReturnFeature(from)).toBeNull();
    }
  );

  it('routes the primary destination to the from feature ahead of the plan default', () => {
    const input = {
      plan: 'pro' as const,
      isOnboardingUpgrade: false,
      fromFeature: '/app/chat',
    };
    expect(getPaidSuccessPrimaryHref(input)).toBe('/app/chat');
    expect(getPaidSuccessPrimaryHref(input)).not.toContain('/billing');
    expect(getPaidSuccessPrimaryLabel(input)).toBe(
      'Open your unlocked feature'
    );

    // Claim-first and onboarding upgrades keep their existing precedence.
    expect(
      getPaidSuccessPrimaryHref({
        plan: 'pro',
        isOnboardingUpgrade: false,
        needsProfile: true,
        fromFeature: '/app/chat',
      })
    ).toBe(APP_ROUTES.START);
    expect(
      getPaidSuccessPrimaryHref({
        plan: 'pro',
        isOnboardingUpgrade: true,
        fromFeature: '/app/chat',
      })
    ).toBe(APP_ROUTES.DASHBOARD);

    // Unresolvable from falls back to the plan-based default.
    expect(
      getPaidSuccessPrimaryHref({
        plan: 'pro',
        isOnboardingUpgrade: false,
        fromFeature: null,
      })
    ).toBe(APP_ROUTES.PRESENCE);
  });

  it('announces the canonical plan name and holds exactly 600ms before navigating', () => {
    expect(getCheckoutSuccessAnnouncement('Artist Presence')).toBe(
      'Payment complete. Artist Presence is active.'
    );
    expect(CHECKOUT_SUCCESS_HOLD_MS).toBe(600);
  });

  it('marks the arrival so the landing feature focuses its main heading', () => {
    expect(withHeadingFocusParam('/app/chat')).toBe('/app/chat?focus=heading');
    expect(withHeadingFocusParam('/app/chat?x=1')).toBe(
      '/app/chat?x=1&focus=heading'
    );
    expect(CHECKOUT_SUCCESS_FOCUS_VALUE).toBe('heading');
  });
});
