import { describe, expect, it } from 'vitest';
import {
  COOKIE_BANNER_REQUIRED_COOKIE,
  isCookieBannerRequired,
  resolveCookieBannerRequirement,
} from '@/lib/cookies/consent-regions';

describe('consent-regions', () => {
  it('exposes the cookie requirement flag name', () => {
    expect(COOKIE_BANNER_REQUIRED_COOKIE).toBe('jv_cc_required');
  });

  it('requires the banner for GDPR-style regions', () => {
    expect(isCookieBannerRequired('DE')).toBe(true);
    expect(isCookieBannerRequired('gb')).toBe(true);
    expect(isCookieBannerRequired(' fr ')).toBe(true);
  });

  it('does not require the banner outside regulated regions', () => {
    expect(isCookieBannerRequired('US')).toBe(false);
    expect(isCookieBannerRequired('CA')).toBe(false);
    expect(isCookieBannerRequired('JP')).toBe(false);
  });

  it('fails safe when country is unavailable', () => {
    expect(isCookieBannerRequired(null)).toBe(true);
  });

  describe('resolveCookieBannerRequirement', () => {
    it('respects explicit cookie override when present', () => {
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: `${COOKIE_BANNER_REQUIRED_COOKIE}=0`,
          countryCode: 'DE',
        })
      ).toBe(false);

      expect(
        resolveCookieBannerRequirement({
          cookieHeader: `${COOKIE_BANNER_REQUIRED_COOKIE}=1`,
          countryCode: 'US',
        })
      ).toBe(true);
    });

    it('falls back to region detection when cookie is missing', () => {
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: null,
          countryCode: 'DE',
        })
      ).toBe(true);
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: null,
          countryCode: 'US',
        })
      ).toBe(false);
    });

    it('falls back to region detection for malformed cookie values', () => {
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: `${COOKIE_BANNER_REQUIRED_COOKIE}=2`,
          countryCode: 'DE',
        })
      ).toBe(true);
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: `${COOKIE_BANNER_REQUIRED_COOKIE}=`,
          countryCode: 'US',
        })
      ).toBe(false);
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: `${COOKIE_BANNER_REQUIRED_COOKIE}=yes`,
          countryCode: 'JP',
        })
      ).toBe(false);
    });
  });
});
