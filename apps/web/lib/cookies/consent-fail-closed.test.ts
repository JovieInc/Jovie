// @vitest-environment jsdom
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCookieBannerRequired,
  isCookieBannerRequiredFromCookieString,
  resolveCookieBannerRequirement,
} from '@/lib/cookies/consent-regions';
import { isAnalyticsAllowed, isMarketingAllowed } from '@/lib/tracking/consent';
import { buildGoogleConsentInitScript } from '@/lib/tracking/google-consent-mode';

describe('consent geo fail-closed', () => {
  it.each([
    ['DE', true],
    ['de', true],
    [' gb ', true],
    ['CH', true],
    ['IS', true],
    ['NO', true],
    ['LI', true],
    ['BR', true],
    ['KR', true],
    ['US', false], // US uses opt-out privacy choices; GPC still overrides
    ['CA', true], // region unknown inside a region-gated country (Quebec)
    ['JP', false],
    ['AU', false],
    ['in', false],
    [null, true],
    [undefined, true],
    ['', true],
    ['   ', true],
    ['XX', true],
    ['T1', true],
    ['USA', true],
    ['D', true],
    ['1A', true],
    ['<script>', true],
  ] as const)('country %j -> required=%s', (country, expected) => {
    expect(isCookieBannerRequired(country ?? null)).toBe(expected);
  });

  it('resolves a missing geo signal and no cookie to required', () => {
    expect(
      resolveCookieBannerRequirement({ cookieHeader: null, countryCode: null })
    ).toBe(true);
  });

  it.each([
    ['', true],
    ['theme=dark', true],
    ['jv_cc_required=', true],
    ['jv_cc_required=2', true],
    ['jv_cc_required=yes', true],
    ['jv_cc_required=0=1', true],
    ['jv_cc_required=0=', true],
    ['jv_cc_required=00', true],
    ['jv_cc_required= 0', false],
    ['jv_cc_required=1; jv_cc_required=0', true],
    ['jv_cc_required=0; jv_cc_required=1', true],
    ['jv_cc_required=0; jv_cc_required=0', false],
    ['jv_cc_required=0; jv_cc_required=0=1', true],
    ['jv_cc_required=; jv_cc_required=0', true],
    ['jv_cc_required=0=1; jv_cc_required=0', true],
    ['jv_cc_required=1', true],
    ['jv_cc_required=0', false],
    ['a=b; jv_cc_required=0; c=d', false],
    ['a=b; jv_cc_required=1', true],
  ])('client cookie %j -> required=%s', (cookie, expected) => {
    expect(isCookieBannerRequiredFromCookieString(cookie)).toBe(expected);
    expect(
      resolveCookieBannerRequirement({
        cookieHeader: cookie,
        countryCode: null,
      })
    ).toBe(expected);
    const dataLayer: unknown[][] = [];
    const context = {
      dataLayer,
      window: { dataLayer },
      document: { cookie },
      navigator: {},
      localStorage: { getItem: () => null },
    };
    runInNewContext(buildGoogleConsentInitScript(), context);
    const update = Array.from(context.window.dataLayer.at(-1) ?? []);
    expect(update[2]).toEqual({
      analytics_storage: expected ? 'denied' : 'granted',
      ad_storage: expected ? 'denied' : 'granted',
      ad_user_data: expected ? 'denied' : 'granted',
      ad_personalization: expected ? 'denied' : 'granted',
    });
  });
});

describe('absent required flag blocks non-essential tracking', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.cookie = 'jv_cc_required=; Max-Age=0; path=/';
    localStorage.clear();
  });

  it('blocks marketing with no flag and no stored choice', () => {
    expect(isMarketingAllowed()).toBe(false);
  });

  it('allows marketing only when the proxy marked a non-required region', () => {
    document.cookie = 'jv_cc_required=0; path=/';
    expect(isMarketingAllowed()).toBe(true);
  });

  it.each([
    '',
    'not-json',
    '{}',
    'null',
    '[]',
    '{"marketing":true}',
    '{"analytics":true}',
    '{"essential":true,"analytics":"true","marketing":false}',
  ])('blocks analytics in a required region for unusable jv_cc %j', raw => {
    document.cookie = 'jv_cc_required=1; path=/';
    localStorage.setItem('jv_cc', raw);
    expect(isAnalyticsAllowed()).toBe(false);
  });

  it.each(['', 'jv_cc_required=1', 'jv_cc_required=0=1'])(
    'blocks analytics when storage throws and the region is uncertain: %j',
    cookie => {
      document.cookie = cookie;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      expect(isAnalyticsAllowed()).toBe(false);
      expect(isMarketingAllowed()).toBe(false);
    }
  );

  it.each([
    ['globalPrivacyControl', true],
    ['doNotTrack', '1'],
    ['doNotTrack', 'yes'],
  ])('honors %s despite affirmative consent', (signal, value) => {
    document.cookie = 'jv_cc_required=0; path=/';
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );
    vi.stubGlobal('navigator', { [signal]: value });
    expect(isAnalyticsAllowed()).toBe(false);
    expect(isMarketingAllowed()).toBe(false);
  });

  it('honors the advertising opt-out without overriding affirmative analytics consent', () => {
    document.cookie = 'jv_cc_required=0; path=/';
    localStorage.setItem('jovie_tracking_consent', 'rejected');
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );
    expect(isAnalyticsAllowed()).toBe(true);
    expect(isMarketingAllowed()).toBe(false);
  });

  it.each(['', '{}', 'null', 'not-json', '{"analytics":true}'])(
    'keeps legacy rejection as the fallback for unusable granular consent: %j',
    raw => {
      document.cookie = 'jv_cc_required=0; path=/';
      localStorage.setItem('jovie_tracking_consent', 'rejected');
      localStorage.setItem('jv_cc', raw);
      expect(isAnalyticsAllowed()).toBe(false);
      expect(isMarketingAllowed()).toBe(false);
    }
  );

  it('keeps analytics allowed for a valid opt-in in a required region', () => {
    document.cookie = 'jv_cc_required=1; path=/';
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: false })
    );
    expect(isAnalyticsAllowed()).toBe(true);
  });
});
