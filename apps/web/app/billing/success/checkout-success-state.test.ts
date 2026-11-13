import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import {
  ARTIST_VISIBILITY_FAN_LIST_UNLOCK,
  getPaidSuccessPrimaryHref,
  getPaidSuccessPrimaryLabel,
  resolveCheckoutSuccessView,
} from './checkout-success-state';

describe('resolveCheckoutSuccessView', () => {
  it('requires a current confirmed receipt, never the URL alone', () => {
    const input = {
      checkoutSessionId: 'cs_test',
      isSessionPlanPending: false,
      validatedSessionPlan: 'pro' as const,
      confirmationStatus: 'confirmed',
      paymentStatus: 'paid' as const,
    };
    expect(resolveCheckoutSuccessView(input)).toMatchObject({
      kind: 'success',
      plan: 'pro',
    });
    expect(
      resolveCheckoutSuccessView({ ...input, checkoutSessionId: null })
    ).toMatchObject({ kind: 'recovery' });
    expect(
      resolveCheckoutSuccessView({ ...input, confirmationStatus: 'pending' })
    ).toMatchObject({ kind: 'recovery' });
    expect(
      resolveCheckoutSuccessView({ ...input, isSessionPlanPending: true })
    ).toMatchObject({ kind: 'pending' });
    expect(
      resolveCheckoutSuccessView({ ...input, paymentStatus: null })
    ).toMatchObject({ kind: 'recovery' });
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
  it('secures the fan list export, which Free cannot use', () => {
    expect(ARTIST_VISIBILITY_FAN_LIST_UNLOCK.href).toBe(
      APP_ROUTES.CONTACTS_AUDIENCE
    );
    expect(ENTITLEMENT_REGISTRY.pro.booleans.canExportContacts).toBe(true);
    expect(ENTITLEMENT_REGISTRY.free.booleans.canExportContacts).toBe(false);
  });
});
