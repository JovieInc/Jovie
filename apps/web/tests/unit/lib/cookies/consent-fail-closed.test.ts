// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  isCookieBannerRequired,
  isCookieBannerRequiredFromCookieString,
  resolveCookieBannerRequirement,
} from '@/lib/cookies/consent-regions';
import { isAnalyticsAllowed, isMarketingAllowed } from '@/lib/tracking/consent';

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
    ['US', true], // region unknown inside a region-gated country
    ['CA', true],
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
    ['jv_cc_required=1', true],
    ['jv_cc_required=0', false],
    ['a=b; jv_cc_required=0; c=d', false],
    ['a=b; jv_cc_required=1', true],
  ])('client cookie %j -> required=%s', (cookie, expected) => {
    expect(isCookieBannerRequiredFromCookieString(cookie)).toBe(expected);
  });
});

describe('absent required flag blocks non-essential tracking', () => {
  afterEach(() => {
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

  it.each(['not-json', '{}', '{"marketing":true}'])(
    'blocks analytics in a required region for unusable jv_cc %j',
    raw => {
      document.cookie = 'jv_cc_required=1; path=/';
      localStorage.setItem('jv_cc', raw);
      expect(isAnalyticsAllowed()).toBe(false);
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
