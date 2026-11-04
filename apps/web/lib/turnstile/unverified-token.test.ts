import { describe, expect, it } from 'vitest';
import {
  parseUnverifiedTurnstileToken,
  unverifiedTurnstileToken,
} from './unverified-token';

describe('unverified turnstile marker', () => {
  it('round-trips a known widget status', () => {
    expect(
      parseUnverifiedTurnstileToken(unverifiedTurnstileToken('unsupported'))
    ).toBe('unsupported');
  });

  it('reports an unrecognized marker status as unknown', () => {
    expect(parseUnverifiedTurnstileToken('jv-unverified:<script>')).toBe(
      'unknown'
    );
  });

  it('ignores real tokens and missing tokens', () => {
    expect(parseUnverifiedTurnstileToken('0.real-cloudflare-token')).toBeNull();
    expect(parseUnverifiedTurnstileToken(undefined)).toBeNull();
    expect(parseUnverifiedTurnstileToken('')).toBeNull();
  });
});
