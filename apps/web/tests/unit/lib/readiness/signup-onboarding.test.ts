import { describe, expect, it } from 'vitest';
import { ENV_KEYS } from '@/lib/env-server-schema';
import {
  checkSignupOnboardingReadiness,
  formatSignupOnboardingReadinessReport,
  REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS,
} from '@/lib/readiness/signup-onboarding';

function readyEnv(authOrigin = 'https://jov.ie') {
  return Object.fromEntries(
    REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS.map(key => [
      key,
      key === 'BETTER_AUTH_URL' || key === 'NEXT_PUBLIC_BETTER_AUTH_URL'
        ? authOrigin
        : `${key}-value`,
    ])
  );
}

describe('signup onboarding readiness', () => {
  it('passes only when every required production signup env var is present', () => {
    const env = readyEnv();

    const result = checkSignupOnboardingReadiness({
      env,
      target: 'prd',
      source: 'env',
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.present).toEqual([...REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS]);
  });

  it('fails closed on a present but invalid production auth URL without printing it', () => {
    const env = readyEnv();
    env.BETTER_AUTH_URL = 'definitely-not-a-url';

    const result = checkSignupOnboardingReadiness({
      env,
      target: 'prd',
      source: 'vercel-file',
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual(['BETTER_AUTH_URL']);
    const report = formatSignupOnboardingReadinessReport(result);
    expect(report).toContain('BETTER_AUTH_URL: INVALID');
    expect(report).toContain('[signup-readiness] invalid=BETTER_AUTH_URL');
    expect(report).not.toContain('definitely-not-a-url');
  });

  it.each([
    ['scheme', 'http://jov.ie'],
    [
      'credentials',
      (() => {
        const url = new URL('https://jov.ie');
        url.username = 'user';
        return url.href;
      })(),
    ],
    ['path', 'https://jov.ie/auth'],
    ['query', 'https://jov.ie/?from=bad'],
    ['hash', 'https://jov.ie/#bad'],
    ['port', 'https://jov.ie:8443'],
    ['attacker host', 'https://attacker.example'],
    ['staging host', 'https://staging.jov.ie'],
  ])('rejects a production auth URL with an invalid %s', (_case, value) => {
    const env = readyEnv();
    env.BETTER_AUTH_URL = value;

    const result = checkSignupOnboardingReadiness({
      env,
      target: 'prd',
      source: 'vercel-file',
    });

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual(['BETTER_AUTH_URL']);
    expect(formatSignupOnboardingReadinessReport(result)).not.toContain(value);
  });

  it('requires the server and public Better Auth origins to match', () => {
    const env = readyEnv();
    env.NEXT_PUBLIC_BETTER_AUTH_URL = 'https://www.jov.ie';

    const result = checkSignupOnboardingReadiness({
      env,
      target: 'prd',
      source: 'env',
    });

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      'BETTER_AUTH_URL',
      'NEXT_PUBLIC_BETTER_AUTH_URL',
    ]);
  });

  it('accepts only the canonical staging origin for staging', () => {
    const staging = checkSignupOnboardingReadiness({
      env: readyEnv('https://staging.jov.ie'),
      target: 'stg',
      source: 'env',
    });
    const productionOrigin = checkSignupOnboardingReadiness({
      env: readyEnv(),
      target: 'stg',
      source: 'env',
    });

    expect(staging.ok).toBe(true);
    expect(productionOrigin.ok).toBe(false);
    expect(productionOrigin.invalid).toEqual([
      'BETTER_AUTH_URL',
      'NEXT_PUBLIC_BETTER_AUTH_URL',
    ]);
  });

  it.skip('fails closed with redacted missing-key output (retired Clerk keys)', () => {
    const result = checkSignupOnboardingReadiness({
      env: {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_123',
        CLERK_SECRET_KEY: 'sk_live_123',
        DATABASE_URL: 'postgres://example',
        SESSION_SECRET: 'x'.repeat(32),
        AI_GATEWAY_API_KEY: 'gateway-key',
      },
      target: 'prd',
      source: 'env',
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
    ]);

    const report = formatSignupOnboardingReadinessReport(result);
    expect(report).toContain('NEXT_PUBLIC_TURNSTILE_SITE_KEY: MISSING');
    expect(report).toContain('TURNSTILE_SECRET_KEY: MISSING');
    expect(report).toContain('CLERK_SECRET_KEY: SET');
    expect(report).not.toContain('sk_live_123');
    expect(report).not.toContain('pk_live_123');
  });

  it('does not require production-only signup keys for local checks', () => {
    const result = checkSignupOnboardingReadiness({
      env: {},
      target: 'local',
      source: 'env',
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('keeps production canary env extraction complete and deduplicated', () => {
    const uniqueKeys = new Set(ENV_KEYS);

    expect(uniqueKeys.size).toBe(ENV_KEYS.length);
    expect(ENV_KEYS).toEqual(
      expect.arrayContaining([
        'E2E_PROD_SIGNUP_EMAIL_BASE',
        'E2E_PROD_SIGNUP_PASSWORD',
        'E2E_PROD_MAILBOX_PROVIDER',
        'E2E_PROD_MAILBOX_CLIENT_ID',
        'E2E_PROD_MAILBOX_CLIENT_SECRET',
        'E2E_PROD_MAILBOX_REFRESH_TOKEN',
        'E2E_PROD_MAILBOX_QUERY_FROM',
        'E2E_PROD_OTP_CHECK_URL',
        'E2E_PROD_OTP_CHECK_TOKEN',
      ])
    );
  });
});
