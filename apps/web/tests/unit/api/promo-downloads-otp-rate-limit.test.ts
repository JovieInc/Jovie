import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  general: vi.fn(),
  send: vi.fn(),
  cooldown: vi.fn(),
  verify: vi.fn(),
  requestEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: hoisted.general },
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock('@/lib/notifications/email-otp-limiters', () => ({
  emailOtpSendLimiter: { limit: hoisted.send },
  emailOtpResendCooldownLimiter: { limit: hoisted.cooldown },
  emailOtpVerifyLimiter: { limit: hoisted.verify },
}));
vi.mock('@/lib/notifications/otp-service', () => ({
  requestEmailOtp: hoisted.requestEmailOtp,
  verifyEmailOtp: hoisted.verifyEmailOtp,
  upsertPromoAudienceMember: vi.fn(),
}));
vi.mock('@/lib/notifications/service', () => ({ sendNotification: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { select: hoisted.dbSelect } }));

function mockActivePromo() {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.limit = vi.fn().mockResolvedValue([
    {
      id: 'promo-1',
      creatorProfileId: 'artist-1',
      releaseId: 'release-1',
      title: 'Track',
      artworkUrl: null,
      isActive: true,
      artistName: 'Artist',
      isPro: true,
    },
  ]);
  hoisted.dbSelect.mockReturnValue(chain);
}

const ok = { success: true, limit: 5, remaining: 4, reset: Date.now() + 1000 };
const blocked = { ...ok, success: false, remaining: 0 };
const params = { params: Promise.resolve({ id: 'promo-1' }) };

function post(url: string, body: unknown) {
  return new NextRequest(
    `http://localhost/api/promo-downloads/promo-1/${url}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

describe('promo download OTP routes are rate limited', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [
      hoisted.general,
      hoisted.send,
      hoisted.cooldown,
      hoisted.verify,
    ]) {
      fn.mockResolvedValue(ok);
    }
  });

  it('request-otp stops at the send limiter before issuing a new code', async () => {
    mockActivePromo();
    hoisted.send.mockResolvedValue(blocked);
    const { POST } = await import(
      '@/app/api/promo-downloads/[id]/request-otp/route'
    );

    const response = await POST(
      post('request-otp', { email: 'fan@example.com' }),
      params
    );

    expect(response.status).toBe(429);
    expect(hoisted.requestEmailOtp).not.toHaveBeenCalled();
  });

  it('request-otp enforces the per-email resend cooldown', async () => {
    mockActivePromo();
    hoisted.cooldown.mockResolvedValue(blocked);
    const { POST } = await import(
      '@/app/api/promo-downloads/[id]/request-otp/route'
    );

    const response = await POST(
      post('request-otp', { email: 'fan@example.com' }),
      params
    );

    expect(response.status).toBe(429);
    expect(hoisted.requestEmailOtp).not.toHaveBeenCalled();
  });

  it('request-otp does not spend the per-email budget on an unknown promo id', async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'innerJoin', 'leftJoin', 'where']) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.limit = vi.fn().mockResolvedValue([]);
    hoisted.dbSelect.mockReturnValue(chain);
    const { POST } = await import(
      '@/app/api/promo-downloads/[id]/request-otp/route'
    );

    const response = await POST(
      post('request-otp', { email: 'fan@example.com' }),
      params
    );

    expect(response.status).toBe(404);
    expect(hoisted.send).not.toHaveBeenCalled();
    expect(hoisted.cooldown).not.toHaveBeenCalled();
  });

  it('verify-otp stops at the verify limiter before checking the code', async () => {
    hoisted.verify.mockResolvedValue(blocked);
    const { POST } = await import(
      '@/app/api/promo-downloads/[id]/verify-otp/route'
    );

    const response = await POST(
      post('verify-otp', { email: 'fan@example.com', code: '123456' }),
      params
    );

    expect(response.status).toBe(429);
    expect(hoisted.verifyEmailOtp).not.toHaveBeenCalled();
    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });
});
