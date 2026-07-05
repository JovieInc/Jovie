import { afterEach, describe, expect, it, vi } from 'vitest';

describe('email OTP generation', () => {
  const originalBypass = process.env.E2E_USE_TEST_AUTH_BYPASS;
  const originalE2eMode = process.env.NEXT_PUBLIC_E2E_MODE;
  const originalVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    if (originalBypass === undefined) {
      delete process.env.E2E_USE_TEST_AUTH_BYPASS;
    } else {
      process.env.E2E_USE_TEST_AUTH_BYPASS = originalBypass;
    }

    if (originalE2eMode === undefined) {
      delete process.env.NEXT_PUBLIC_E2E_MODE;
    } else {
      process.env.NEXT_PUBLIC_E2E_MODE = originalE2eMode;
    }

    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }

    vi.resetModules();
  });

  it('returns the deterministic fan-capture OTP when E2E bypass is enabled', async () => {
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    vi.resetModules();

    const { generateFanCaptureEmailOtpCode } = await import(
      '@/lib/notifications/email-otp'
    );

    expect(generateFanCaptureEmailOtpCode()).toBe('424242');
    expect(generateFanCaptureEmailOtpCode()).toBe('424242');
  });

  it('never returns the deterministic OTP from generateEmailOtpCode', async () => {
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    vi.resetModules();

    const { generateEmailOtpCode } = await import(
      '@/lib/notifications/email-otp'
    );

    const codes = new Set(
      Array.from({ length: 20 }, () => generateEmailOtpCode())
    );

    expect(codes.has('424242')).toBe(false);
    expect(codes.size).toBeGreaterThan(1);
    for (const code of codes) {
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('returns random fan-capture codes when E2E bypass is disabled', async () => {
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    vi.resetModules();

    const { generateFanCaptureEmailOtpCode } = await import(
      '@/lib/notifications/email-otp'
    );

    const codes = new Set(
      Array.from({ length: 20 }, () => generateFanCaptureEmailOtpCode())
    );

    expect(codes.size).toBeGreaterThan(1);
    for (const code of codes) {
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('disables deterministic fan-capture OTP on production deploys', async () => {
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    process.env.VERCEL_ENV = 'production';
    vi.resetModules();

    const { generateFanCaptureEmailOtpCode } = await import(
      '@/lib/notifications/email-otp'
    );

    const codes = new Set(
      Array.from({ length: 20 }, () => generateFanCaptureEmailOtpCode())
    );

    expect(codes.has('424242')).toBe(false);
    expect(codes.size).toBeGreaterThan(1);
  });
});
