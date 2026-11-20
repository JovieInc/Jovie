import { describe, expect, it, vi } from 'vitest';
import { PRODUCTION_AUTH_SMOKE_EMAIL } from '../../e2e/utils/production-auth-credentials';
import {
  extractProductionAuthOtp,
  isProductionCanaryOtpEmail,
  newProdcertUserEmail,
  waitForProductionAuthOtp,
} from '../../e2e/utils/production-auth-otp';

const startedAtMs = Date.now();
const freshRecord = {
  value: '123456:0',
  created_at: new Date(startedAtMs + 1_000),
  expires_at: new Date(startedAtMs + 600_000),
};

describe('production Better Auth OTP retrieval', () => {
  it('extracts only a fresh unexpired six-digit OTP with an attempt counter', () => {
    expect(
      extractProductionAuthOtp(freshRecord, startedAtMs, startedAtMs + 2_000)
    ).toBe('123456');
    expect(
      extractProductionAuthOtp(
        { ...freshRecord, value: '123456' },
        startedAtMs,
        startedAtMs + 2_000
      )
    ).toBeNull();
    expect(
      extractProductionAuthOtp(
        { ...freshRecord, value: 'not-an-otp:0' },
        startedAtMs,
        startedAtMs + 2_000
      )
    ).toBeNull();
    expect(
      extractProductionAuthOtp(
        { ...freshRecord, value: '123456:5' },
        startedAtMs,
        startedAtMs + 2_000
      )
    ).toBeNull();
  });

  it('rejects stale and expired records', () => {
    expect(
      extractProductionAuthOtp(
        {
          ...freshRecord,
          created_at: new Date(startedAtMs - 31_000),
        },
        startedAtMs,
        startedAtMs + 2_000
      )
    ).toBeNull();
    expect(
      extractProductionAuthOtp(
        {
          ...freshRecord,
          expires_at: new Date(startedAtMs + 1_000),
        },
        startedAtMs,
        startedAtMs + 2_000
      )
    ).toBeNull();
  });

  it('polls the exact normalized email until a fresh OTP appears', async () => {
    const loadRecord = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(freshRecord);

    await expect(
      waitForProductionAuthOtp({
        email: `  ${PRODUCTION_AUTH_SMOKE_EMAIL.toUpperCase()} `,
        startedAtMs,
        loadRecord,
        timeoutMs: 100,
        pollIntervalMs: 1,
      })
    ).resolves.toBe('123456');
    expect(loadRecord).toHaveBeenCalledTimes(2);
    expect(loadRecord).toHaveBeenCalledWith(
      PRODUCTION_AUTH_SMOKE_EMAIL,
      startedAtMs
    );
  });

  it('fails closed when DATABASE_URL is unavailable', async () => {
    await expect(
      waitForProductionAuthOtp({
        email: PRODUCTION_AUTH_SMOKE_EMAIL,
        startedAtMs,
        environment: {},
      })
    ).rejects.toThrow(
      'Production Better Auth OTP retrieval requires DATABASE_URL.'
    );
  });

  it('refuses every identity outside the dedicated smoke account', async () => {
    const loadRecord = vi.fn();
    await expect(
      waitForProductionAuthOtp({
        email: 'other@example.com',
        startedAtMs,
        loadRecord,
      })
    ).rejects.toThrow(
      'Production Better Auth OTP retrieval refused a non-smoke identity.'
    );
    expect(loadRecord).not.toHaveBeenCalled();
  });

  it('reads exactly the tagged prodcert new-user canary and nothing near it', async () => {
    const loadRecord = vi.fn().mockResolvedValue(null);
    const ok = newProdcertUserEmail('Run-12345abc');
    expect(ok).toBe('browse-ready+synthetic-prodcert-run12345abc@jov.ie');
    expect(isProductionCanaryOtpEmail(ok)).toBe(true);
    for (const bad of [
      'browse-ready@jov.ie',
      'browse-ready+synthetic-prodcert-abc@jov.ie',
      'browse-ready+synthetic-prodcert-abcdef12@gmail.com',
      'browse-ready+synthetic-prodcert-abcdef12@evil.jov.ie',
      'someone+synthetic-prodcert-abcdef12@jov.ie',
      'browse-ready+synthetic-prodcert-abcdef12+x@jov.ie',
      'tim@jov.ie',
    ]) {
      expect(isProductionCanaryOtpEmail(bad), bad).toBe(false);
      await expect(
        waitForProductionAuthOtp({ email: bad, startedAtMs, loadRecord })
      ).rejects.toThrow('refused a non-smoke identity');
    }
    expect(loadRecord).not.toHaveBeenCalled();
  });

  it('deliberate red: the creator-ready smoke identity still resolves unchanged', () => {
    expect(isProductionCanaryOtpEmail('browse-ready+clerk_test@jov.ie')).toBe(
      true
    );
    expect(isProductionCanaryOtpEmail('browse+clerk_test@jov.ie')).toBe(false);
  });
});
