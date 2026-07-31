import { describe, expect, it } from 'vitest';
import {
  isPaymentSupportPlatform,
  isRenderablePublicUrl,
  publicLinkAriaLabel,
  sanitizePublicHref,
} from '@/lib/utils/public-url';

describe('public-url hygiene', () => {
  it('accepts normal https destinations', () => {
    expect(isRenderablePublicUrl('https://itstimwhite.com')).toBe(true);
    expect(isRenderablePublicUrl('https://www.instagram.com/timwhite')).toBe(
      true
    );
  });

  it('rejects bare hosts without a TLD (malformed website links)', () => {
    expect(isRenderablePublicUrl('https://itstimwhite/')).toBe(false);
    expect(isRenderablePublicUrl('https://itstimwhite')).toBe(false);
    expect(sanitizePublicHref('itstimwhite')).toBeNull();
    expect(sanitizePublicHref('https://itstimwhite/')).toBeNull();
  });

  it('rejects non-http schemes', () => {
    expect(isRenderablePublicUrl('javascript:alert(1)')).toBe(false);
    expect(isRenderablePublicUrl('mailto:hi@example.com')).toBe(false);
  });

  it('normalizes bare domains with a real TLD', () => {
    expect(sanitizePublicHref('example.com/path')).toBe(
      'https://example.com/path'
    );
  });

  it('classifies payment platforms as support, not follow', () => {
    expect(isPaymentSupportPlatform('venmo')).toBe(true);
    expect(isPaymentSupportPlatform('paypal')).toBe(true);
    expect(isPaymentSupportPlatform('instagram')).toBe(false);
  });

  it('builds accessible names for website vs social vs support', () => {
    expect(publicLinkAriaLabel('Tim White', 'website', 'Website')).toBe(
      "Visit Tim White's website"
    );
    expect(publicLinkAriaLabel('Tim White', 'instagram', 'Instagram')).toBe(
      'Follow Tim White on Instagram'
    );
    expect(publicLinkAriaLabel('Tim White', 'venmo', 'Venmo')).toBe(
      'Support Tim White on Venmo'
    );
  });
});
