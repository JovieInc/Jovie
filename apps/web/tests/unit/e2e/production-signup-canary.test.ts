import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProductionSignupEmail,
  extractClerkOtp,
  isProductionSyntheticSignupEmail,
  validateProductionSignupCanaryConfig,
  waitForProductionSignupOtp,
} from '@/tests/e2e/utils/production-signup-canary';

describe('production signup canary helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('supports a Cloudflare Email Routing OTP check without Gmail credentials', () => {
    const result = validateProductionSignupCanaryConfig({
      E2E_PROD_SIGNUP_EMAIL_BASE: 'synthetic-signup@e2e-jovie-signup.com',
      E2E_PROD_SIGNUP_PASSWORD: 'secret-pass',
      E2E_PROD_MAILBOX_PROVIDER: 'cloudflare-email-routing',
      E2E_PROD_OTP_CHECK_URL: 'https://otp-check.example.workers.dev/latest',
      E2E_PROD_OTP_CHECK_TOKEN: 'worker-token',
      CLERK_SECRET_KEY: 'sk_live_123',
    });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.summary).toContain('E2E_PROD_OTP_CHECK_URL: SET');
    expect(result.summary).not.toContain('worker-token');
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
      'CLERK_SECRET_KEY',
      'E2E_PROD_MAILBOX_CLIENT_SECRET',
      'E2E_PROD_MAILBOX_REFRESH_TOKEN',
    ]);
    expect(result.summary).toContain('E2E_PROD_SIGNUP_PASSWORD: MISSING');
    expect(result.summary).toContain('E2E_PROD_MAILBOX_CLIENT_ID: SET');
    expect(result.summary).not.toContain('client-id');
  });

  it('reports missing Cloudflare OTP endpoint keys without requiring Gmail OAuth', () => {
    const result = validateProductionSignupCanaryConfig({
      E2E_PROD_SIGNUP_EMAIL_BASE: 'synthetic-signup@e2e-jovie-signup.com',
      E2E_PROD_SIGNUP_PASSWORD: 'secret-pass',
      E2E_PROD_MAILBOX_PROVIDER: 'cloudflare-email-routing',
      CLERK_SECRET_KEY: 'sk_live_123',
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      'E2E_PROD_OTP_CHECK_URL',
      'E2E_PROD_OTP_CHECK_TOKEN',
    ]);
    expect(result.summary).toContain('E2E_PROD_OTP_CHECK_URL: MISSING');
    expect(result.summary).not.toContain('E2E_PROD_MAILBOX_CLIENT_ID');
  });

  it('polls the Cloudflare OTP check endpoint with a bearer token', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer worker-token',
          'Content-Type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          email: 'synthetic-signup+run-123@e2e-jovie-signup.com',
          sinceMs: 123,
        });

        return new Response(
          JSON.stringify({
            text: 'Your Jovie verification code is 123456.',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      waitForProductionSignupOtp({
        email: 'synthetic-signup+run-123@e2e-jovie-signup.com',
        env: {
          E2E_PROD_MAILBOX_PROVIDER: 'cloudflare-email-routing',
          E2E_PROD_OTP_CHECK_URL:
            'https://otp-check.example.workers.dev/latest',
          E2E_PROD_OTP_CHECK_TOKEN: 'worker-token',
        },
        startedAtMs: 123,
        timeoutMs: 1000,
      })
    ).resolves.toBe('123456');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://otp-check.example.workers.dev/latest',
      expect.any(Object)
    );
  });
});
