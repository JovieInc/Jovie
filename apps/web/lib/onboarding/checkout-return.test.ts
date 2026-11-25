import { describe, expect, it } from 'vitest';
import {
  buildOnboardingCheckoutReturnHref,
  getOnboardingCheckoutReturnToast,
  stripOnboardingCheckoutReturnParams,
} from './checkout-return';

describe('getOnboardingCheckoutReturnToast', () => {
  it('returns success toast for upgrade=success', () => {
    expect(getOnboardingCheckoutReturnToast('success')).toEqual({
      tone: 'success',
      message: 'Upgrade complete.',
    });
  });

  it('returns cancel toast for upgrade=cancel', () => {
    expect(getOnboardingCheckoutReturnToast('cancel')).toEqual({
      tone: 'info',
      message: 'Checkout cancelled. You can keep going for free.',
    });
  });

  it('returns null for unknown or empty status', () => {
    expect(getOnboardingCheckoutReturnToast(null)).toBeNull();
    expect(getOnboardingCheckoutReturnToast('')).toBeNull();
    expect(getOnboardingCheckoutReturnToast('pending')).toBeNull();
  });
});

describe('stripOnboardingCheckoutReturnParams', () => {
  it('removes upgrade, session_id, and plan_id while keeping handoff params', () => {
    const next = stripOnboardingCheckoutReturnParams(
      'from=onboarding&panel=profile&upgrade=success&session_id=cs_test_123&plan_id=pro'
    );
    expect(next.get('from')).toBe('onboarding');
    expect(next.get('panel')).toBe('profile');
    expect(next.get('upgrade')).toBeNull();
    expect(next.get('session_id')).toBeNull();
    expect(next.get('plan_id')).toBeNull();
  });
});

describe('buildOnboardingCheckoutReturnHref', () => {
  it('rebuilds chat handoff href without checkout residue', () => {
    expect(
      buildOnboardingCheckoutReturnHref(
        '/app/chat',
        'from=onboarding&panel=profile&upgrade=success&session_id=cs_test'
      )
    ).toBe('/app/chat?from=onboarding&panel=profile');
  });

  it('returns bare pathname when nothing remains', () => {
    expect(
      buildOnboardingCheckoutReturnHref('/app/chat', 'upgrade=cancel')
    ).toBe('/app/chat');
  });
});
