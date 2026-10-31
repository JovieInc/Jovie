/**
 * Provider quota visibility (2026-10-31: test sign-ins used the whole Resend
 * Free quota and real sign-in codes stopped). The gateway must read the quota
 * headers on every send, report pressure before the quota runs out, and
 * report exhaustion when Resend refuses for quota.
 */
import { describe, expect, it, vi } from 'vitest';
import { type GatewayDeps, runGateway } from '@/lib/email/gateway/core';
import {
  exhaustedQuota,
  pressureOf,
  quotaLimitsFor,
  readQuota,
} from '@/lib/email/gateway/quota';
import type { EmailTransport } from '@/lib/email/gateway/resend-transport';

const limits = { plan: 'free', daily: 100, monthly: 3000, warnAt: 0.8 };

describe('readQuota', () => {
  it('returns null when the response carries no quota header', () => {
    expect(readQuota(null, limits)).toBeNull();
    expect(readQuota({ 'content-type': 'json' }, limits)).toBeNull();
  });

  it('reads headers case-insensitively and takes the tighter limit', () => {
    const q = readQuota(
      { 'X-Resend-Daily-Quota': '85', 'x-resend-monthly-quota': '900' },
      limits
    );
    expect(q).toMatchObject({
      dailyUsed: 85,
      monthlyUsed: 900,
      dailyLimit: 100,
      monthlyLimit: 3000,
      usedFrac: 0.85,
      pressure: 'warn',
    });
  });

  it('ignores malformed values instead of guessing', () => {
    expect(readQuota({ 'x-resend-daily-quota': 'n/a' }, limits)).toBeNull();
    expect(readQuota({ 'x-resend-monthly-quota': '-4' }, limits)).toBeNull();
  });

  it('reports usage without pressure when no limit is configured', () => {
    expect(readQuota({ 'x-resend-monthly-quota': '10' }, null)).toMatchObject({
      monthlyUsed: 10,
      usedFrac: null,
      pressure: 'ok',
    });
  });

  it('grades pressure at the warn level and at the limit', () => {
    expect(pressureOf(0.79, 0.8)).toBe('ok');
    expect(pressureOf(0.8, 0.8)).toBe('warn');
    expect(pressureOf(1, 0.8)).toBe('exhausted');
    expect(pressureOf(null, 0.8)).toBe('ok');
    expect(exhaustedQuota(limits).pressure).toBe('exhausted');
  });

  it('reads the Resend limits from the stream registry', () => {
    const resend = quotaLimitsFor('resend');
    expect(resend?.daily).toBeGreaterThan(0);
    expect(resend?.warnAt).toBeGreaterThan(0);
    expect(resend?.warnAt).toBeLessThan(1);
  });
});

function deps(send: EmailTransport['send'], overrides: Partial<GatewayDeps>) {
  return {
    env: {},
    mailingAddress: '1 Example Street, Los Angeles, CA 90001',
    entityName: 'Jovie Technology Inc.',
    transport: { name: 'resend', configured: () => true, send },
    testRecipientBlock: () => null,
    readPause: async () => null,
    cardStatus: async () => 'approved',
    suppression: async () => ({ suppressed: false }),
    rateLimited: async () => false,
    record: () => {},
    onViolation: () => {},
    ...overrides,
  } satisfies GatewayDeps;
}

const otp = {
  stream: 'transactional' as const,
  purpose: 'auth-otp',
  consent: { basis: 'auth-request' as const },
  to: 'person@example.com',
  subject: 'Your code',
  text: 'Code: 123456',
};

describe('gateway quota reporting', () => {
  it('records quota on the send line and raises pressure at the warn level', async () => {
    const record = vi.fn();
    const onQuotaPressure = vi.fn();
    const quota = readQuota({ 'x-resend-daily-quota': '90' }, limits);
    const result = await runGateway(
      otp,
      deps(async () => ({ ok: true, messageId: 'm1', quota }), {
        record,
        onQuotaPressure,
      })
    );
    expect(result.status).toBe('sent');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ quotaDailyUsed: 90, quotaUsedFrac: 0.9 })
    );
    expect(onQuotaPressure).toHaveBeenCalledWith(
      expect.objectContaining({ pressure: 'warn' }),
      'transactional'
    );
  });

  it('stays quiet below the warn level', async () => {
    const onQuotaPressure = vi.fn();
    const quota = readQuota({ 'x-resend-daily-quota': '10' }, limits);
    await runGateway(
      otp,
      deps(async () => ({ ok: true, messageId: 'm1', quota }), {
        onQuotaPressure,
      })
    );
    expect(onQuotaPressure).not.toHaveBeenCalled();
  });

  it('raises exhaustion when the provider refuses for quota', async () => {
    const onQuotaPressure = vi.fn();
    const result = await runGateway(
      otp,
      deps(
        async () => ({
          ok: false,
          error: 'daily quota exceeded',
          quota: exhaustedQuota(limits),
        }),
        { onQuotaPressure }
      )
    );
    expect(result.status).toBe('error');
    expect(onQuotaPressure).toHaveBeenCalledWith(
      expect.objectContaining({ pressure: 'exhausted' }),
      'transactional'
    );
  });
});
