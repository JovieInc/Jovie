import { describe, expect, it } from 'vitest';
import { decodeFapiHostFromPublishableKey } from '@/lib/auth/decode-fapi-host';

function makeKey(prefix: 'pk_live_' | 'pk_test_', host: string): string {
  // Base64-encode the host with the trailing `$` Clerk uses.
  const b64 = Buffer.from(`${host}$`).toString('base64');
  return `${prefix}${b64}`;
}

describe('decodeFapiHostFromPublishableKey', () => {
  it('decodes a pk_live_ key to its FAPI host', () => {
    const key = makeKey('pk_live_', 'clerk.staging.jov.ie');
    expect(decodeFapiHostFromPublishableKey(key)).toBe('clerk.staging.jov.ie');
  });

  it('decodes a pk_test_ key to its FAPI host', () => {
    const key = makeKey('pk_test_', 'distinct-giraffe-5.clerk.accounts.dev');
    expect(decodeFapiHostFromPublishableKey(key)).toBe(
      'distinct-giraffe-5.clerk.accounts.dev'
    );
  });

  it('returns null for an empty input', () => {
    expect(decodeFapiHostFromPublishableKey('')).toBeNull();
    expect(decodeFapiHostFromPublishableKey(null)).toBeNull();
    expect(decodeFapiHostFromPublishableKey(undefined)).toBeNull();
  });

  it('returns null for a key with the wrong prefix', () => {
    expect(decodeFapiHostFromPublishableKey('sk_live_abc')).toBeNull();
    expect(decodeFapiHostFromPublishableKey('pk_other_abc')).toBeNull();
    expect(decodeFapiHostFromPublishableKey('abcdef')).toBeNull();
  });

  it('returns null for a key with malformed base64', () => {
    expect(
      decodeFapiHostFromPublishableKey('pk_live_!!!not-base64!!!')
    ).toBeNull();
  });

  it('returns null when the payload decodes to empty after stripping $', () => {
    const key = `pk_live_${Buffer.from('$').toString('base64')}`;
    expect(decodeFapiHostFromPublishableKey(key)).toBeNull();
  });
});
