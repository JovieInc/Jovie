import { describe, expect, it } from 'vitest';
import { hasServerMarketingConsent } from '@/lib/cookies/consent-state';

const optIn = { essential: true, analytics: true, marketing: true };
const optOut = { essential: true, analytics: true, marketing: false };

describe('hasServerMarketingConsent', () => {
  it('default-allows opt-out regions without a saved choice', () => {
    expect(
      hasServerMarketingConsent({
        consent: null,
        requiresCookieConsent: false,
        secGpc: null,
      })
    ).toBe(true);
  });

  it('requires an affirmative opt-in in consent-required regions', () => {
    expect(
      hasServerMarketingConsent({
        consent: null,
        requiresCookieConsent: true,
        secGpc: null,
      })
    ).toBe(false);
    expect(
      hasServerMarketingConsent({
        consent: optIn,
        requiresCookieConsent: true,
        secGpc: null,
      })
    ).toBe(true);
  });

  it('honors a saved advertising opt-out', () => {
    expect(
      hasServerMarketingConsent({
        consent: optOut,
        requiresCookieConsent: false,
        secGpc: null,
      })
    ).toBe(false);
  });

  it.each([null, optIn, optOut])(
    'honors immediate browser withdrawal before server consent is saved: %j',
    consent => {
      expect(
        hasServerMarketingConsent({
          consent,
          requiresCookieConsent: false,
          secGpc: null,
          trackingConsent: 'rejected',
        })
      ).toBe(false);
    }
  );

  it.each(['accepted', 'invalid', null])(
    'does not let a legacy value grant marketing consent in a required region: %j',
    trackingConsent => {
      expect(
        hasServerMarketingConsent({
          consent: null,
          requiresCookieConsent: true,
          secGpc: null,
          trackingConsent,
        })
      ).toBe(false);
    }
  );

  it.each([
    [null, false],
    [optIn, false],
    [optIn, true],
  ] as const)(
    'treats Sec-GPC as an opt-out over any saved choice (%j, required=%s)',
    (consent, requiresCookieConsent) => {
      expect(
        hasServerMarketingConsent({
          consent,
          requiresCookieConsent,
          secGpc: '1',
        })
      ).toBe(false);
    }
  );
});
