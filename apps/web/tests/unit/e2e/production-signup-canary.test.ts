import { describe, expect, it } from 'vitest';
import {
  buildProductionSignupEmail,
  extractClerkOtp,
  isProductionSyntheticSignupEmail,
  validateProductionSignupCanaryConfig,
} from '@/tests/e2e/utils/production-signup-canary';

describe('production signup canary helpers', () => {
  it('builds plus-addressed synthetic signup emails from a dedicated mailbox', () => {
    expect(
      buildProductionSignupEmail('synthetic-signup@jov.ie', 'run_123')
    ).toBe('synthetic-signup+run-123@jov.ie');
  });

  it('extracts Clerk one-time codes from Gmail message text', () => {
    expect(
      extractClerkOtp(
        'Your Jovie verification code is 123456. It expires soon.'
      )
    ).toBe('123456');
    expect(extractClerkOtp('Use code 123-456 to complete your sign up.')).toBe(
      '123456'
    );
  });

  it('limits cleanup eligibility to plus-addressed synthetic emails', () => {
    expect(
      isProductionSyntheticSignupEmail(
        'synthetic-signup+run-123@jov.ie',
        'synthetic-signup@jov.ie'
      )
    ).toBe(true);
    expect(
      isProductionSyntheticSignupEmail(
        'synthetic-signup@jov.ie',
        'synthetic-signup@jov.ie'
      )
    ).toBe(false);
    expect(
      isProductionSyntheticSignupEmail(
        'somebody+run-123@jov.ie',
        'synthetic-signup@jov.ie'
      )
    ).toBe(false);
  });

  it('fails fast when required mailbox or cleanup secrets are missing', () => {
    const result = validateProductionSignupCanaryConfig({
      E2E_PROD_SIGNUP_EMAIL_BASE: 'synthetic-signup@jov.ie',
      E2E_PROD_SIGNUP_PASSWORD: 'secret-pass',
      E2E_PROD_MAILBOX_PROVIDER: 'gmail',
      E2E_PROD_MAILBOX_CLIENT_ID: 'client-id',
      E2E_PROD_MAILBOX_CLIENT_SECRET: 'client-secret',
      E2E_PROD_MAILBOX_REFRESH_TOKEN: 'refresh-token',
      CLERK_SECRET_KEY: 'sk_live_123',
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('reports missing keys without leaking configured values', () => {
    const result = validateProductionSignupCanaryConfig({
      E2E_PROD_SIGNUP_EMAIL_BASE: 'synthetic-signup@jov.ie',
      E2E_PROD_MAILBOX_PROVIDER: 'gmail',
      E2E_PROD_MAILBOX_CLIENT_ID: 'client-id',
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      'E2E_PROD_SIGNUP_PASSWORD',
      'E2E_PROD_MAILBOX_CLIENT_SECRET',
      'E2E_PROD_MAILBOX_REFRESH_TOKEN',
      'CLERK_SECRET_KEY',
    ]);
    expect(result.summary).toContain('E2E_PROD_SIGNUP_PASSWORD: MISSING');
    expect(result.summary).toContain('E2E_PROD_MAILBOX_CLIENT_ID: SET');
    expect(result.summary).not.toContain('client-id');
  });
});
