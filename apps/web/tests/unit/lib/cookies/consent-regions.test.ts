import { describe, expect, it } from 'vitest';
import {
  COOKIE_BANNER_REQUIRED_COOKIE,
  isCookieBannerRequired,
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
});
