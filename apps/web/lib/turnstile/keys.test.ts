import { describe, expect, it } from 'vitest';
import {
  assertTurnstileClientServerPairCompatible,
  normalizeTurnstileHostname,
  resolveTurnstileSecretKey,
  resolveTurnstileSiteKey,
  shouldUseTurnstileDummyKeys,
  TURNSTILE_ALWAYS_PASS_SECRET_KEY,
  TURNSTILE_ALWAYS_PASS_SITE_KEY,
} from './keys';

const REAL_SITE_KEY = '0x4AAAAAAARealSiteKeyExample';
const REAL_SECRET = '0x4AAAAAAARealSecretKeyExample';

describe('normalizeTurnstileHostname', () => {
  it('lowercases and strips ports', () => {
    expect(normalizeTurnstileHostname('JOV.IE:443')).toBe('jov.ie');
  });

  it('takes the first host from a comma list', () => {
    expect(normalizeTurnstileHostname('jov.ie, internal:8080')).toBe('jov.ie');
  });

  it('parses full URLs', () => {
    expect(normalizeTurnstileHostname('https://staging.jov.ie/start')).toBe(
      'staging.jov.ie'
    );
  });

  it('returns null for empty input', () => {
    expect(normalizeTurnstileHostname(null)).toBeNull();
    expect(normalizeTurnstileHostname('')).toBeNull();
    expect(normalizeTurnstileHostname('   ')).toBeNull();
  });
});

describe('shouldUseTurnstileDummyKeys', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
    'app.localhost',
    'jovie-timwhite-jovie.vercel.app',
    'jovie-abc123-jovie.vercel.app',
  ])('uses dummy keys on non-allowlisted host %s', host => {
    expect(shouldUseTurnstileDummyKeys(host)).toBe(true);
  });

  it.each([
    'jov.ie',
    'www.jov.ie',
    'staging.jov.ie',
    'main.jov.ie',
  ])('does not use dummy keys on allowlisted host %s', host => {
    expect(shouldUseTurnstileDummyKeys(host)).toBe(false);
  });

  it('does not force dummy keys when hostname is unknown (SSR-safe)', () => {
    expect(shouldUseTurnstileDummyKeys(null)).toBe(false);
    expect(shouldUseTurnstileDummyKeys(undefined)).toBe(false);
  });
});

describe('resolveTurnstileSiteKey', () => {
  it('returns undefined when no site key is configured', () => {
    expect(resolveTurnstileSiteKey('jov.ie', undefined)).toBeUndefined();
    expect(resolveTurnstileSiteKey('jov.ie', '')).toBeUndefined();
    expect(resolveTurnstileSiteKey('jov.ie', '   ')).toBeUndefined();
  });

  it('keeps the real site key on production/staging hosts', () => {
    expect(resolveTurnstileSiteKey('jov.ie', REAL_SITE_KEY)).toBe(
      REAL_SITE_KEY
    );
    expect(resolveTurnstileSiteKey('www.jov.ie', REAL_SITE_KEY)).toBe(
      REAL_SITE_KEY
    );
    expect(resolveTurnstileSiteKey('staging.jov.ie', REAL_SITE_KEY)).toBe(
      REAL_SITE_KEY
    );
    expect(resolveTurnstileSiteKey('main.jov.ie', REAL_SITE_KEY)).toBe(
      REAL_SITE_KEY
    );
  });

  it('swaps to the always-pass site key on Vercel preview hosts (110200 fix)', () => {
    expect(
      resolveTurnstileSiteKey('jovie-timwhite-jovie.vercel.app', REAL_SITE_KEY)
    ).toBe(TURNSTILE_ALWAYS_PASS_SITE_KEY);
  });

  it('swaps to the always-pass site key on localhost', () => {
    expect(resolveTurnstileSiteKey('localhost', REAL_SITE_KEY)).toBe(
      TURNSTILE_ALWAYS_PASS_SITE_KEY
    );
  });

  it('keeps configured key when hostname is null (SSR does not flip to dummy)', () => {
    expect(resolveTurnstileSiteKey(null, REAL_SITE_KEY)).toBe(REAL_SITE_KEY);
  });

  it('passes through when already configured with the dummy site key', () => {
    expect(
      resolveTurnstileSiteKey('jov.ie', TURNSTILE_ALWAYS_PASS_SITE_KEY)
    ).toBe(TURNSTILE_ALWAYS_PASS_SITE_KEY);
  });
});

describe('resolveTurnstileSecretKey', () => {
  it('returns null when no secret is configured', () => {
    expect(resolveTurnstileSecretKey('jov.ie', undefined)).toBeNull();
    expect(resolveTurnstileSecretKey('jov.ie', '')).toBeNull();
  });

  it('keeps the real secret on production/staging hosts', () => {
    expect(resolveTurnstileSecretKey('jov.ie', REAL_SECRET)).toBe(REAL_SECRET);
    expect(resolveTurnstileSecretKey('staging.jov.ie', REAL_SECRET)).toBe(
      REAL_SECRET
    );
  });

  it('pairs preview hosts with the always-pass secret', () => {
    expect(
      resolveTurnstileSecretKey('jovie-timwhite-jovie.vercel.app', REAL_SECRET)
    ).toBe(TURNSTILE_ALWAYS_PASS_SECRET_KEY);
  });

  it('pairs localhost with the always-pass secret', () => {
    expect(resolveTurnstileSecretKey('localhost', REAL_SECRET)).toBe(
      TURNSTILE_ALWAYS_PASS_SECRET_KEY
    );
  });

  it('does not swap secrets when hostname is unknown', () => {
    expect(resolveTurnstileSecretKey(null, REAL_SECRET)).toBe(REAL_SECRET);
  });
});

describe('client/server pair guardrail (mismatch impossible)', () => {
  it.each([
    'jov.ie',
    'www.jov.ie',
    'staging.jov.ie',
    'jovie-timwhite-jovie.vercel.app',
    'localhost',
  ])('resolved pair is compatible for host %s with real env keys', host => {
    const site = resolveTurnstileSiteKey(host, REAL_SITE_KEY);
    const secret = resolveTurnstileSecretKey(host, REAL_SECRET);
    const check = assertTurnstileClientServerPairCompatible(
      host,
      REAL_SITE_KEY,
      REAL_SECRET
    );
    expect(check).toEqual({ ok: true });
    const siteDummy = site === TURNSTILE_ALWAYS_PASS_SITE_KEY;
    const secretDummy = secret === TURNSTILE_ALWAYS_PASS_SECRET_KEY;
    expect(siteDummy).toBe(secretDummy);
  });

  it('rejects half-configured env', () => {
    expect(
      assertTurnstileClientServerPairCompatible('jov.ie', REAL_SITE_KEY, null)
    ).toMatchObject({ ok: false });
  });

  it('preview host never keeps a real sitekey when real env is present', () => {
    expect(
      resolveTurnstileSiteKey('jovie-timwhite-jovie.vercel.app', REAL_SITE_KEY)
    ).not.toBe(REAL_SITE_KEY);
  });
});
