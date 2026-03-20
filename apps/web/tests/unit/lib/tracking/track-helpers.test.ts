/**
 * Tests for helper functions in the /api/track route.
 * These are extracted as pure functions for testability.
 */
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// anonymizeIp — inline reimplementation for unit testing
// (In production these live inside the route handler; we test the logic here)
// ---------------------------------------------------------------------------

function anonymizeIp(ip: string): string {
  if (ip.includes(':')) {
    const parts = ip.split(':');
    const fullParts: string[] = [];
    for (const part of parts) {
      if (part === '') {
        const missing = 8 - parts.filter(p => p !== '').length;
        for (let i = 0; i < missing; i++) fullParts.push('0000');
      } else {
        fullParts.push(part);
      }
    }
    while (fullParts.length < 8) fullParts.push('0000');
    return fullParts.slice(0, 3).concat(['0', '0', '0', '0', '0']).join(':');
  }
  const parts = ip.split('.');
  if (parts.length === 4) {
    parts[3] = '0';
    return parts.join('.');
  }
  return '0.0.0.0';
}

function deriveAttributionSource(
  utmParams: { utm_source?: string; utm_medium?: string } | null | undefined
): string | null {
  if (!utmParams?.utm_source || utmParams.utm_medium !== 'retargeting')
    return null;
  const src = utmParams.utm_source.toLowerCase();
  if (src === 'meta' || src === 'facebook') return 'retargeting_meta';
  if (src === 'google') return 'retargeting_google';
  if (src === 'tiktok') return 'retargeting_tiktok';
  return null;
}

describe('anonymizeIp', () => {
  it('zeroes last octet of IPv4', () => {
    expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.0');
  });

  it('handles 0.0.0.0', () => {
    expect(anonymizeIp('0.0.0.0')).toBe('0.0.0.0');
  });

  it('handles 255.255.255.255', () => {
    expect(anonymizeIp('255.255.255.255')).toBe('255.255.255.0');
  });

  it('zeroes last 5 groups of full IPv6', () => {
    const result = anonymizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    expect(result).toBe('2001:0db8:85a3:0:0:0:0:0');
  });

  it('handles IPv6 with :: shorthand', () => {
    const result = anonymizeIp('2001:db8::1');
    // :: expands to fill missing groups, then last 5 are zeroed
    expect(result).toMatch(/^2001:db8:0000:0:0:0:0:0$/);
  });

  it('handles loopback IPv6', () => {
    const result = anonymizeIp('::1');
    // :: expands, then last 5 zeroed
    expect(result).toContain(':0:0:0:0:0');
  });

  it('returns 0.0.0.0 for invalid input', () => {
    expect(anonymizeIp('not-an-ip')).toBe('0.0.0.0');
  });

  it('returns 0.0.0.0 for empty string', () => {
    expect(anonymizeIp('')).toBe('0.0.0.0');
  });
});

describe('deriveAttributionSource', () => {
  it('returns retargeting_meta for utm_source=meta', () => {
    expect(
      deriveAttributionSource({ utm_source: 'meta', utm_medium: 'retargeting' })
    ).toBe('retargeting_meta');
  });

  it('returns retargeting_meta for utm_source=facebook', () => {
    expect(
      deriveAttributionSource({
        utm_source: 'facebook',
        utm_medium: 'retargeting',
      })
    ).toBe('retargeting_meta');
  });

  it('returns retargeting_google for utm_source=google', () => {
    expect(
      deriveAttributionSource({
        utm_source: 'google',
        utm_medium: 'retargeting',
      })
    ).toBe('retargeting_google');
  });

  it('returns retargeting_tiktok for utm_source=tiktok', () => {
    expect(
      deriveAttributionSource({
        utm_source: 'tiktok',
        utm_medium: 'retargeting',
      })
    ).toBe('retargeting_tiktok');
  });

  it('returns null when utm_medium is not retargeting', () => {
    expect(
      deriveAttributionSource({ utm_source: 'meta', utm_medium: 'cpc' })
    ).toBe(null);
  });

  it('returns null when utm_source is missing', () => {
    expect(deriveAttributionSource({ utm_medium: 'retargeting' })).toBe(null);
  });

  it('returns null for null input', () => {
    expect(deriveAttributionSource(null)).toBe(null);
  });

  it('returns null for undefined input', () => {
    expect(deriveAttributionSource(undefined)).toBe(null);
  });

  it('returns null for unknown source', () => {
    expect(
      deriveAttributionSource({
        utm_source: 'pinterest',
        utm_medium: 'retargeting',
      })
    ).toBe(null);
  });

  it('is case-insensitive for utm_source', () => {
    expect(
      deriveAttributionSource({
        utm_source: 'Meta',
        utm_medium: 'retargeting',
      })
    ).toBe('retargeting_meta');
    expect(
      deriveAttributionSource({
        utm_source: 'GOOGLE',
        utm_medium: 'retargeting',
      })
    ).toBe('retargeting_google');
  });
});
