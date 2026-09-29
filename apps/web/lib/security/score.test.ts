import { describe, expect, it } from 'vitest';
import { computeSecurityScore } from './score';

describe('computeSecurityScore', () => {
  it('returns 0 when no protections are active', () => {
    const { score, factors } = computeSecurityScore({
      emailVerified: false,
      hasPassword: false,
      passkeyCount: 0,
    });

    expect(score).toBe(0);
    expect(factors.every(factor => !factor.active)).toBe(true);
  });

  it('returns 100 when all protections are active', () => {
    const { score } = computeSecurityScore({
      emailVerified: true,
      hasPassword: true,
      passkeyCount: 2,
    });

    expect(score).toBe(100);
  });

  it('weights passkeys above any other single factor', () => {
    const passkeyOnly = computeSecurityScore({
      emailVerified: false,
      hasPassword: false,
      passkeyCount: 1,
    });
    const emailOnly = computeSecurityScore({
      emailVerified: true,
      hasPassword: false,
      passkeyCount: 0,
    });

    expect(passkeyOnly.score).toBeGreaterThan(emailOnly.score);
  });

  it('does not count zero passkeys as an active factor', () => {
    const { factors } = computeSecurityScore({
      emailVerified: true,
      hasPassword: true,
      passkeyCount: 0,
    });

    const passkey = factors.find(factor => factor.id === 'passkey');
    expect(passkey?.active).toBe(false);
  });
});
