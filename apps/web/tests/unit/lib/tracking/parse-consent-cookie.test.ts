/**
 * Tests for server-side consent cookie parsing used by /api/track.
 */
import { describe, expect, it } from 'vitest';

interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

// Reimplemented from track/route.ts for unit testing
function parseConsentCookie(
  cookieValue: string | undefined
): ConsentPreferences | null {
  try {
    if (!cookieValue) return null;
    const parsed = JSON.parse(cookieValue) as ConsentPreferences;
    if (typeof parsed?.marketing !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

describe('parseConsentCookie', () => {
  it('returns null for undefined cookie value', () => {
    expect(parseConsentCookie(undefined)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(parseConsentCookie('')).toBe(null);
  });

  it('returns null for invalid JSON', () => {
    expect(parseConsentCookie('not-json')).toBe(null);
  });

  it('returns null when marketing field is missing', () => {
    expect(parseConsentCookie('{"essential":true}')).toBe(null);
  });

  it('returns null when marketing is not boolean', () => {
    expect(
      parseConsentCookie(
        '{"essential":true,"analytics":true,"marketing":"yes"}'
      )
    ).toBe(null);
  });

  it('parses valid consent with marketing=true', () => {
    const result = parseConsentCookie(
      '{"essential":true,"analytics":true,"marketing":true}'
    );
    expect(result).toEqual({
      essential: true,
      analytics: true,
      marketing: true,
    });
  });

  it('parses valid consent with marketing=false', () => {
    const result = parseConsentCookie(
      '{"essential":true,"analytics":false,"marketing":false}'
    );
    expect(result).toEqual({
      essential: true,
      analytics: false,
      marketing: false,
    });
  });

  it('returns null for number value', () => {
    expect(parseConsentCookie('42')).toBe(null);
  });

  it('returns null for array', () => {
    expect(parseConsentCookie('[1,2,3]')).toBe(null);
  });
});
