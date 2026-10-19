import { describe, expect, it } from 'vitest';
import { resolvePasskeyRpId } from './passkey-rp-id';

describe('resolvePasskeyRpId', () => {
  it('binds every hosted Jovie origin to jov.ie, never localhost', () => {
    expect(resolvePasskeyRpId({ VERCEL_ENV: 'production' })).toBe('jov.ie');
    expect(resolvePasskeyRpId({ VERCEL_ENV: 'preview' })).toBe('jov.ie');
  });

  it('uses localhost for local development and tests', () => {
    expect(resolvePasskeyRpId({ VERCEL_ENV: 'development' })).toBe('localhost');
    expect(resolvePasskeyRpId({})).toBe('localhost');
  });

  it('follows the loopback hostname the browser origin actually uses', () => {
    expect(
      resolvePasskeyRpId({
        VERCEL_ENV: 'development',
        NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
      })
    ).toBe('127.0.0.1');
    expect(
      resolvePasskeyRpId({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
      })
    ).toBe('jov.ie');
  });
});
