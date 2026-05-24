import { describe, expect, it } from 'vitest';
import {
  canFallbackToBypassUserId,
  hasClerkOriginMismatchSignal,
  isClerkHandshakeUrl,
  isClerkOriginMismatchMessage,
  resolveBypassFallbackUserId,
  resolveBypassSessionUrls,
} from './clerk-auth';

describe('clerk-auth helpers', () => {
  it('detects clerk handshake urls', () => {
    expect(
      isClerkHandshakeUrl(
        'https://clerk.example.com/v1/client/handshake?redirect_url=%2Fapp'
      )
    ).toBe(true);
    expect(
      isClerkHandshakeUrl(
        'https://clerk.example.com/v1/client/dev-browser?redirect_url=%2Fapp'
      )
    ).toBe(true);
    expect(isClerkHandshakeUrl('https://jov.ie/signin')).toBe(false);
  });

  it('detects clerk preview origin mismatch messages', () => {
    expect(
      isClerkOriginMismatchMessage(
        'Clerk: Production Keys are only allowed for domain "staging.jov.ie".'
      )
    ).toBe(true);
    expect(
      isClerkOriginMismatchMessage(
        'API Error: The Request HTTP Origin header must be equal to or a subdomain of the requesting URL.'
      )
    ).toBe(true);
    expect(
      isClerkOriginMismatchMessage('TimeoutError: page.waitForFunction')
    ).toBe(false);
  });

  it('detects clerk origin mismatch from timeout plus console warning', () => {
    expect(
      hasClerkOriginMismatchSignal('TimeoutError: page.waitForFunction', [
        'Clerk: Production Keys are only allowed for domain "staging.jov.ie".',
      ])
    ).toBe(true);
    expect(
      hasClerkOriginMismatchSignal('TimeoutError: page.waitForFunction', [
        'Some unrelated warning',
      ])
    ).toBe(false);
  });

  it('allows explicit user fallback for any bypass persona', () => {
    expect(canFallbackToBypassUserId('creator')).toBe(true);
    expect(canFallbackToBypassUserId('creator-ready')).toBe(true);
    expect(canFallbackToBypassUserId('admin')).toBe(true);
    expect(canFallbackToBypassUserId(null)).toBe(false);
  });

  it('prefers the seeded bypass user over per-test overrides for persona fallback', () => {
    const originalUserId = process.env.E2E_CLERK_USER_ID;
    process.env.E2E_CLERK_USER_ID = 'seeded-ci-user';

    try {
      expect(
        resolveBypassFallbackUserId('creator-ready', 'ad-hoc-test-user')
      ).toBe('seeded-ci-user');
      expect(resolveBypassFallbackUserId(null, 'ad-hoc-test-user')).toBe(
        'ad-hoc-test-user'
      );
    } finally {
      if (originalUserId === undefined) {
        delete process.env.E2E_CLERK_USER_ID;
      } else {
        process.env.E2E_CLERK_USER_ID = originalUserId;
      }
    }
  });

  it('resolves localhost bypass session urls with an IPv4 fallback', () => {
    expect(resolveBypassSessionUrls('http://localhost:3100')).toEqual([
      'http://localhost:3100/api/dev/test-auth/session',
      'http://127.0.0.1:3100/api/dev/test-auth/session',
    ]);
    expect(resolveBypassSessionUrls('http://127.0.0.1:3100')).toEqual([
      'http://127.0.0.1:3100/api/dev/test-auth/session',
    ]);
  });
});
