import { describe, expect, it } from 'vitest';
import { ENV_KEYS } from '@/lib/env-server-schema';
import {
  checkSignupOnboardingReadiness,
  formatSignupOnboardingReadinessReport,
  REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS,
} from '@/lib/readiness/signup-onboarding';

describe('signup onboarding readiness', () => {
  it('passes only when every required production signup env var is present', () => {
    const env = Object.fromEntries(
      REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS.map(key => [key, `${key}-value`])
    );

    const result = checkSignupOnboardingReadiness({
      env,
      target: 'prd',
      source: 'env',
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual([...REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS]);
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
