import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import {
  ARTIST_VISIBILITY_FAN_LIST_UNLOCK,
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
    ).toBe(APP_ROUTES.CONTACTS_AUDIENCE);
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

describe('paid-only unlock after checkout', () => {
  it('lands the paid artist on the fan list export, which Free cannot use', () => {
    const input = { plan: 'pro' as const, isOnboardingUpgrade: false };
    expect(getPaidSuccessPrimaryLabel(input)).toBe('Open your fan list');
    expect(ARTIST_VISIBILITY_FAN_LIST_UNLOCK.href).toBe(
      APP_ROUTES.CONTACTS_AUDIENCE
    );
    expect(ENTITLEMENT_REGISTRY.pro.booleans.canExportContacts).toBe(true);
    expect(ENTITLEMENT_REGISTRY.free.booleans.canExportContacts).toBe(false);
  });
});
