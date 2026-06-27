import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Consent } from '@/lib/cookies/consent';
import {
  buildGoogleAnalyticsConfigScript,
  buildGoogleConsentInitScript,
  consentToGoogleConsentMode,
  getGoogleConsentModeFromClient,
  isCookieBannerRequiredFromClient,
  isValidGaMeasurementId,
  readStoredConsentFromClient,
  shouldMountGoogleAnalytics,
} from '@/lib/tracking/google-consent-mode';

describe('google-consent-mode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie =
      'jv_cc_required=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  afterEach(() => {
    localStorage.clear();
    document.cookie =
      'jv_cc_required=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('validates GA measurement IDs', () => {
    expect(isValidGaMeasurementId('G-TMY7Z8HK47')).toBe(true);
    expect(isValidGaMeasurementId('G-ABC12345')).toBe(true);
    expect(isValidGaMeasurementId('UA-123456-1')).toBe(false);
    expect(isValidGaMeasurementId(undefined)).toBe(false);
  });

  it('maps stored consent to Google Consent Mode v2 fields', () => {
    const consent: Consent = {
      essential: true,
      analytics: true,
      marketing: false,
    };

    expect(consentToGoogleConsentMode(consent, true)).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('defaults to denied in consent-required regions without a stored choice', () => {
    document.cookie = 'jv_cc_required=1; path=/';

    expect(consentToGoogleConsentMode(null, true)).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('defaults to granted outside consent-required regions', () => {
    expect(consentToGoogleConsentMode(null, false)).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
  });

  it('reads stored consent from localStorage', () => {
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: false, marketing: true })
    );

    expect(readStoredConsentFromClient()).toEqual({
      essential: true,
      analytics: false,
      marketing: true,
    });
  });

  it('detects consent-required cookie from the client', () => {
    document.cookie = 'jv_cc_required=1; path=/';
    expect(isCookieBannerRequiredFromClient()).toBe(true);

    document.cookie = 'jv_cc_required=0; path=/';
    expect(isCookieBannerRequiredFromClient()).toBe(false);
  });

  it('resolves client consent mode from stored preferences', () => {
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );

    expect(getGoogleConsentModeFromClient()).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
  });

  it('decides when GA should mount in the root layout', () => {
    expect(
      shouldMountGoogleAnalytics({
        measurementId: 'G-TMY7Z8HK47',
        isTest: false,
        isE2E: false,
        isDemoRecording: false,
      })
    ).toBe(true);
    expect(
      shouldMountGoogleAnalytics({
        measurementId: undefined,
        isTest: false,
        isE2E: false,
        isDemoRecording: false,
      })
    ).toBe(false);
    expect(
      shouldMountGoogleAnalytics({
        measurementId: 'G-TMY7Z8HK47',
        isTest: false,
        isE2E: true,
        isDemoRecording: false,
      })
    ).toBe(false);
  });

  it('builds consent init and config scripts for gtag', () => {
    const measurementId = 'G-TMY7Z8HK47';

    expect(buildGoogleConsentInitScript(measurementId)).toContain(
      "gtag('consent', 'default'"
    );
    expect(buildGoogleConsentInitScript(measurementId)).toContain(
      'jv_cc_required=1'
    );
    expect(buildGoogleAnalyticsConfigScript(measurementId)).toContain(
      "gtag('config', 'G-TMY7Z8HK47')"
    );
  });
});
