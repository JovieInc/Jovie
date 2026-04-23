import { describe, expect, it } from 'vitest';
import { isPublicAuthHost } from '@/components/providers/clerkAvailability';

describe('isPublicAuthHost', () => {
  it('returns true for https staging host', () => {
    expect(
      isPublicAuthHost({ protocol: 'https:', hostname: 'staging.jov.ie' })
    ).toBe(true);
  });

  it('returns true for https production host', () => {
    expect(isPublicAuthHost({ protocol: 'https:', hostname: 'jov.ie' })).toBe(
      true
    );
  });

  it('returns false for http localhost dev', () => {
    expect(isPublicAuthHost({ protocol: 'http:', hostname: 'localhost' })).toBe(
      false
    );
  });

  it('returns false for https localhost (edge case, still treated as private)', () => {
    expect(
      isPublicAuthHost({ protocol: 'https:', hostname: 'localhost' })
    ).toBe(false);
  });

  it('returns false for private IPv4', () => {
    expect(
      isPublicAuthHost({ protocol: 'http:', hostname: '192.168.1.42' })
    ).toBe(false);
  });

  it('returns false when location is undefined (SSR)', () => {
    expect(isPublicAuthHost(undefined)).toBe(false);
  });

  it('returns false for http staging (protocol gate)', () => {
    expect(
      isPublicAuthHost({ protocol: 'http:', hostname: 'staging.jov.ie' })
    ).toBe(false);
  });
});
