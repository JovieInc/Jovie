import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSignupClaimValue,
  persistSignupClaimValue,
  readSignupClaimValue,
} from '@/lib/auth/signup-claim-storage';

describe('signup claim storage', () => {
  const key = 'test_signup_claim';

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('persists values to both storages and reads from session first', () => {
    persistSignupClaimValue(key, 'spotify-url', 1000);

    expect(window.sessionStorage.getItem(key)).toBe(
      JSON.stringify({ value: 'spotify-url', ts: 1000 })
    );
    expect(window.localStorage.getItem(key)).toBe(
      JSON.stringify({ value: 'spotify-url', ts: 1000 })
    );
    expect(readSignupClaimValue(key, { now: 1001, ttlMs: 5_000 })).toBe(
      'spotify-url'
    );
  });

  it('falls back to localStorage and rehydrates sessionStorage', () => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ value: 'artist-name', ts: 2500 })
    );

    expect(readSignupClaimValue(key, { now: 3000, ttlMs: 10_000 })).toBe(
      'artist-name'
    );
    expect(window.sessionStorage.getItem(key)).toBe(
      JSON.stringify({ value: 'artist-name', ts: 3000 })
    );
  });

  it('clears expired structured values', () => {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ value: 'stale', ts: 1000 })
    );

    expect(readSignupClaimValue(key, { now: 20_000, ttlMs: 1_000 })).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('supports clearing values from both storages', () => {
    persistSignupClaimValue(key, 'to-clear', 1_000);

    clearSignupClaimValue(key);

    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('handles unavailable sessionStorage while reading from localStorage', () => {
    const originalSessionStorage = globalThis.sessionStorage;

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: null,
    });

    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ value: 'artist-name', ts: 2500 })
      );

      expect(readSignupClaimValue(key, { now: 3000, ttlMs: 10_000 })).toBe(
        'artist-name'
      );
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: originalSessionStorage,
      });
    }
  });
});
