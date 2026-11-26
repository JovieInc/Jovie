import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { PROOF_PENDING_TERMS } from '@/lib/claim/proof-terms';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import {
  ARTIST_VISIBILITY_FAN_LIST_UNLOCK,
  getPaidSuccessPrimaryHref,
  getPaidSuccessPrimaryLabel,
  resolveCheckoutSuccessCopy,
  resolveCheckoutSuccessView,
  shouldCelebratePaidSuccess,
} from './checkout-success-state';

describe('resolveCheckoutSuccessView', () => {
  it('requires a confirmed session and payment before paid success', () => {
    const pending = resolveCheckoutSuccessView({
      checkoutSessionId: 'cs_test',
      isSessionPlanPending: true,
      validatedSessionPlan: null,
      confirmationStatus: 'pending',
      paymentStatus: null,
    });
    const sessionOnly = resolveCheckoutSuccessView({
      checkoutSessionId: 'cs_test',
      isSessionPlanPending: false,
      validatedSessionPlan: 'pro',
      confirmationStatus: 'unconfirmed',
      paymentStatus: null,
    });
    const directNav = resolveCheckoutSuccessView({
      checkoutSessionId: null,
      isSessionPlanPending: false,
      validatedSessionPlan: 'pro',
      confirmationStatus: 'confirmed',
      paymentStatus: 'paid',
    });
    const failed = resolveCheckoutSuccessView({
      checkoutSessionId: 'cs_test',
      isSessionPlanPending: false,
      validatedSessionPlan: null,
      confirmationStatus: 'unconfirmed',
      paymentStatus: null,
    });
    expect(pending).toEqual({ kind: 'pending', reason: 'session' });
    expect(sessionOnly).toEqual({
      kind: 'recovery',
      reason: 'session_unconfirmed',
    });
    expect(directNav).toEqual({ kind: 'recovery', reason: 'not_entitled' });
    expect(failed).toEqual({ kind: 'recovery', reason: 'session_unconfirmed' });
    expect(shouldCelebratePaidSuccess(failed)).toBe(false);
    expect(shouldCelebratePaidSuccess(directNav)).toBe(false);
    expect(
      resolveCheckoutSuccessView({
        checkoutSessionId: 'cs_test',
        isSessionPlanPending: false,
        validatedSessionPlan: 'pro',
        confirmationStatus: 'confirmed',
        paymentStatus: 'paid',
      })
    ).toMatchObject({ kind: 'success', plan: 'pro', paymentStatus: 'paid' });
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

describe('resolveCheckoutSuccessCopy', () => {
  it('does not claim the profile is live on onboarding success when profileLive is not public', () => {
    const copy = resolveCheckoutSuccessCopy({
      view: {
        kind: 'success',
        plan: 'pro',
        displayName: 'Pro',
        paymentStatus: 'paid',
      },
      isOnboardingUpgrade: true,
      proofPending: false,
      canClaimProfileLive: false,
      isArtistVisibilitySuccess: true,
      paidDisplayName: 'Pro',
      proofPendingTerms: PROOF_PENDING_TERMS,
      sessionStatus: null,
    });
    expect(copy.title).toBe('Your plan is active');
    expect(copy.title).not.toBe('Your profile is live and upgraded');
  });
});

describe('paid-only unlock after checkout', () => {
  it('secures the fan list export, which Free cannot use', () => {
    expect(ARTIST_VISIBILITY_FAN_LIST_UNLOCK.href).toBe(
      APP_ROUTES.CONTACTS_AUDIENCE
    );
    expect(ENTITLEMENT_REGISTRY.pro.booleans.canExportContacts).toBe(true);
    expect(ENTITLEMENT_REGISTRY.free.booleans.canExportContacts).toBe(false);
  });
});
