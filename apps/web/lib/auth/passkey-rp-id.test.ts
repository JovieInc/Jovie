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
});
