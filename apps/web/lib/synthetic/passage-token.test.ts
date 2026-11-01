import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  derivePassageKey,
  mintPassageToken,
  PASSAGE_TOKEN_MAX_TTL_SECONDS,
  verifyPassageToken,
} from './passage-token';
import { newProdcertUserEmail } from './prodcert-identities';

const ROOT = 'cron-secret-for-tests-0123456789abcdef';
const KEY = derivePassageKey(ROOT);
const NOW = 1_800_000_000;
const CANARY = newProdcertUserEmail('run12345');

function mint(overrides: Partial<Parameters<typeof mintPassageToken>[1]> = {}) {
  return mintPassageToken(KEY, {
    sub: CANARY,
    scp: 'onboarding_chat',
    run: '1234-1',
    nowSeconds: NOW,
    ...overrides,
  });
}

/** Re-sign arbitrary claims, as an attacker holding the key could. */
function forge(claims: Record<string, unknown>, key = KEY): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', key)
    .update(`jsp1.${body}`)
    .digest('base64url');
  return `jsp1.${body}.${sig}`;
}

describe('passage token', () => {
  it('accepts a fresh canary token for its scope', () => {
    const verdict = verifyPassageToken(mint(), KEY, 'onboarding_chat', NOW + 5);
    expect(verdict).toMatchObject({
      ok: true,
      claims: { sub: CANARY, scp: 'onboarding_chat', run: '1234-1' },
    });
  });

  it('accepts the returning canary identity', () => {
    const token = mint({ sub: 'browse-ready+clerk_test@jov.ie' });
    expect(verifyPassageToken(token, KEY, 'onboarding_chat', NOW).ok).toBe(
      true
    );
  });

  it('derives a key distinct from the root secret itself', () => {
    const signedWithRoot = forge(
      {
        sub: CANARY,
        scp: 'onboarding_chat',
        iat: NOW,
        exp: NOW + 60,
        jti: 'a'.repeat(24),
        run: 'r',
      },
      Buffer.from(ROOT)
    );
    expect(
      verifyPassageToken(signedWithRoot, KEY, 'onboarding_chat', NOW)
    ).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it.each([
    ['expired', NOW + 301, 'expired'],
    ['issued in the future', NOW - 60, 'not_yet_valid'],
  ])('rejects a token that is %s', (_label, now, reason) => {
    expect(verifyPassageToken(mint(), KEY, 'onboarding_chat', now)).toEqual({
      ok: false,
      reason,
    });
  });

  it('rejects a token signed with another key', () => {
    const other = derivePassageKey('another-root-secret-0123456789');
    expect(verifyPassageToken(mint(), other, 'onboarding_chat', NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects tampered claims', () => {
    const [prefix, , sig] = mint().split('.');
    const body = Buffer.from(
      JSON.stringify({ sub: 'artist@band.com' })
    ).toString('base64url');
    expect(
      verifyPassageToken(
        `${prefix}.${body}.${sig}`,
        KEY,
        'onboarding_chat',
        NOW
      )
    ).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses a correctly signed token for a real customer', () => {
    const token = forge({
      sub: 'artist@band.com',
      scp: 'onboarding_chat',
      iat: NOW,
      exp: NOW + 60,
      jti: 'b'.repeat(24),
      run: 'r',
    });
    expect(verifyPassageToken(token, KEY, 'onboarding_chat', NOW)).toEqual({
      ok: false,
      reason: 'not_canary',
    });
  });

  it('refuses a correctly signed token that outlives the maximum TTL', () => {
    const token = forge({
      sub: CANARY,
      scp: 'onboarding_chat',
      iat: NOW,
      exp: NOW + PASSAGE_TOKEN_MAX_TTL_SECONDS + 1,
      jti: 'c'.repeat(24),
      run: 'r',
    });
    expect(verifyPassageToken(token, KEY, 'onboarding_chat', NOW)).toEqual({
      ok: false,
      reason: 'ttl_too_long',
    });
  });

  it('refuses a correctly signed token for another scope', () => {
    const token = forge({
      sub: CANARY,
      scp: 'checkout',
      iat: NOW,
      exp: NOW + 60,
      jti: 'd'.repeat(24),
      run: 'r',
    });
    expect(verifyPassageToken(token, KEY, 'onboarding_chat', NOW)).toEqual({
      ok: false,
      reason: 'wrong_scope',
    });
  });

  it('accepts a smartlink_click token only for the smartlink click scope', () => {
    const token = mint({ scp: 'smartlink_click' });
    expect(
      verifyPassageToken(token, KEY, 'smartlink_click', NOW + 5)
    ).toMatchObject({
      ok: true,
      claims: { sub: CANARY, scp: 'smartlink_click' },
    });
    // An onboarding_chat passage can never tag a smartlink click synthetic.
    expect(verifyPassageToken(mint(), KEY, 'smartlink_click', NOW + 5)).toEqual(
      { ok: false, reason: 'wrong_scope' }
    );
    expect(verifyPassageToken(token, KEY, 'onboarding_chat', NOW + 5)).toEqual({
      ok: false,
      reason: 'wrong_scope',
    });
  });

  it.each([
    ['empty', ''],
    ['no prefix', 'abc.def.ghi'],
    ['two parts', 'jsp1.abc'],
    ['oversized', `jsp1.${'a'.repeat(2000)}.b`],
  ])('rejects a %s token', (_label, token) => {
    expect(verifyPassageToken(token, KEY, 'onboarding_chat', NOW).ok).toBe(
      false
    );
  });

  it('will not mint for non-canary identities or long lifetimes', () => {
    expect(() => mint({ sub: 'artist@band.com' })).toThrow(/canary/);
    expect(() =>
      mint({ ttlSeconds: PASSAGE_TOKEN_MAX_TTL_SECONDS + 1 })
    ).toThrow(/TTL/);
    expect(() => derivePassageKey('short')).toThrow();
  });

  it('gives every token a unique jti', () => {
    const a = verifyPassageToken(mint(), KEY, 'onboarding_chat', NOW);
    const b = verifyPassageToken(mint(), KEY, 'onboarding_chat', NOW);
    expect(a.ok && b.ok && a.claims.jti !== b.claims.jti).toBe(true);
  });
});

describe('CI key derivation parity (scripts/synthetic-passage-key.mjs)', () => {
  it('derives exactly the key the server verifies with', async () => {
    const { derivePassageKeyBase64Url } = await import(
      '../../../../scripts/synthetic-passage-key.mjs'
    );
    const ciKey = Buffer.from(derivePassageKeyBase64Url(ROOT), 'base64url');
    expect(ciKey.equals(KEY)).toBe(true);
    expect(() => derivePassageKeyBase64Url('')).toThrow(/CRON_SECRET/);
  });
});
