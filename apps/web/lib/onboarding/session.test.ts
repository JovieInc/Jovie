import { afterAll, describe, expect, it, vi } from 'vitest';

// SESSION_SECRET must be set BEFORE we import the module (server-only import
// calls cookies() lazily, but signing reads the secret at function-call time).
const ORIGINAL_SESSION_SECRET = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = 'test-session-secret-test-session-secret-padding';

afterAll(() => {
  if (ORIGINAL_SESSION_SECRET === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = ORIGINAL_SESSION_SECRET;
  }
});

// Mock next/headers so the cookie module doesn't crash when imported outside
// a request scope. Only encode/verify are exercised in this test file.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

import { encodeSessionCookie, verifySessionCookie } from './session';

const VALID_UUID = '00112233-4455-6677-8899-aabbccddeeff';
const ANOTHER_UUID = 'ffeeddcc-bbaa-9988-7766-554433221100';

describe('onboarding session cookie', () => {
  it('roundtrips a freshly minted sessionId', () => {
    const cookie = encodeSessionCookie(VALID_UUID);
    expect(verifySessionCookie(cookie)).toBe(VALID_UUID);
  });

  it('rejects a tampered signature', () => {
    const cookie = encodeSessionCookie(VALID_UUID);
    // Flip the last character of the signature.
    const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
    expect(verifySessionCookie(tampered)).toBeNull();
  });

  it('rejects a swapped sessionId with someone else’s signature', () => {
    const cookie = encodeSessionCookie(VALID_UUID);
    const [, sig] = cookie.split('.');
    expect(verifySessionCookie(`${ANOTHER_UUID}.${sig}`)).toBeNull();
  });

  it('rejects malformed shapes', () => {
    expect(verifySessionCookie('')).toBeNull();
    expect(verifySessionCookie(undefined)).toBeNull();
    expect(verifySessionCookie('no-dot-here')).toBeNull();
    expect(verifySessionCookie('.starts-with-dot')).toBeNull();
    expect(verifySessionCookie('ends-with-dot.')).toBeNull();
  });

  it('rejects a non-UUID sessionId', () => {
    const fake = encodeSessionCookie('not-a-uuid');
    // Signature is valid for the (malformed) input, but verify rejects on shape.
    expect(verifySessionCookie(fake)).toBeNull();
  });
});
