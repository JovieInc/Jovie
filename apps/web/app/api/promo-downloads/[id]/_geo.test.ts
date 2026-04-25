import { describe, expect, it } from 'vitest';
import { decodeCityHeader } from './_geo';

describe('decodeCityHeader', () => {
  it('returns null for null/missing header', () => {
    expect(decodeCityHeader(null)).toBeNull();
  });

  it('returns null for empty / whitespace-only header', () => {
    expect(decodeCityHeader('')).toBeNull();
    expect(decodeCityHeader('   ')).toBeNull();
  });

  it('decodes valid percent-encoded city names', () => {
    expect(decodeCityHeader('S%C3%A3o%20Paulo')).toBe('São Paulo');
    expect(decodeCityHeader('New%20York')).toBe('New York');
  });

  it('returns plain ASCII city unchanged', () => {
    expect(decodeCityHeader('Berlin')).toBe('Berlin');
  });

  it('does NOT throw on malformed percent-encoding (regression)', () => {
    // Bare `decodeURIComponent('%E0%A4')` throws URIError. Previously this
    // bubbled out of request-otp and verify-otp, returning a 500 — and in
    // verify-otp it would 500 AFTER the OTP was already consumed, blocking
    // the legitimate user.
    expect(() => decodeCityHeader('%E0%A4')).not.toThrow();
    expect(() => decodeCityHeader('%')).not.toThrow();
    expect(() => decodeCityHeader('%ZZ')).not.toThrow();
    expect(() => decodeCityHeader('not%a%valid%seq')).not.toThrow();
  });

  it('falls back to the trimmed raw value when decoding fails', () => {
    expect(decodeCityHeader('%E0%A4')).toBe('%E0%A4');
    expect(decodeCityHeader('  %ZZ  ')).toBe('%ZZ');
  });

  it('trims surrounding whitespace before decoding', () => {
    expect(decodeCityHeader('  Berlin  ')).toBe('Berlin');
    expect(decodeCityHeader('  S%C3%A3o%20Paulo  ')).toBe('São Paulo');
  });
});
