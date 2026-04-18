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

  it('requires the banner for Brazil (LGPD)', () => {
    expect(isCookieBannerRequired('BR')).toBe(true);
  });

  it('requires the banner for South Korea (PIPA)', () => {
    expect(isCookieBannerRequired('KR')).toBe(true);
  });

  it('does not require the banner outside regulated regions', () => {
    expect(isCookieBannerRequired('JP')).toBe(false);
    expect(isCookieBannerRequired('AU')).toBe(false);
  });

  it('does not show the banner when country is unavailable', () => {
    expect(isCookieBannerRequired(null)).toBe(false);
  });

  describe('US state-level detection', () => {
    it('requires the banner for regulated US states', () => {
      expect(isCookieBannerRequired('US', 'CA')).toBe(true);
      expect(isCookieBannerRequired('US', 'CO')).toBe(true);
      expect(isCookieBannerRequired('US', 'VA')).toBe(true);
      expect(isCookieBannerRequired('US', 'CT')).toBe(true);
      expect(isCookieBannerRequired('US', 'UT')).toBe(true);
    });

    it('does not require the banner for non-regulated US states', () => {
      expect(isCookieBannerRequired('US', 'TX')).toBe(false);
      expect(isCookieBannerRequired('US', 'NY')).toBe(false);
      expect(isCookieBannerRequired('US', 'FL')).toBe(false);
    });

    it('shows the banner when US region is unknown (safe fallback)', () => {
      expect(isCookieBannerRequired('US', null)).toBe(true);
      expect(isCookieBannerRequired('US', undefined)).toBe(true);
    });

    it('handles case-insensitive US region codes', () => {
      expect(isCookieBannerRequired('US', 'ca')).toBe(true);
      expect(isCookieBannerRequired('us', 'CA')).toBe(true);
    });
  });

  describe('Canada region-level detection', () => {
    it('requires the banner for Quebec (Law 25)', () => {
      expect(isCookieBannerRequired('CA', 'QC')).toBe(true);
    });

    it('does not require the banner for other Canadian provinces', () => {
      expect(isCookieBannerRequired('CA', 'ON')).toBe(false);
      expect(isCookieBannerRequired('CA', 'BC')).toBe(false);
    });

    it('shows the banner when Canadian region is unknown (safe fallback)', () => {
      expect(isCookieBannerRequired('CA', null)).toBe(true);
    });
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
          regionCode: 'TX',
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
          regionCode: 'TX',
        })
      ).toBe(false);
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: null,
          countryCode: 'US',
          regionCode: 'CA',
        })
      ).toBe(true);
    });

    it('passes region through to detection', () => {
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: null,
          countryCode: 'CA',
          regionCode: 'QC',
        })
      ).toBe(true);
      expect(
        resolveCookieBannerRequirement({
          cookieHeader: null,
          countryCode: 'CA',
          regionCode: 'ON',
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
          regionCode: 'TX',
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
