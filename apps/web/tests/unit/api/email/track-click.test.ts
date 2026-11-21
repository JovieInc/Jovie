import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyTrackingToken = vi.hoisted(() => vi.fn());
const mockRecordEngagement = vi.hoisted(() => vi.fn());
const mockScheduleAfter = vi.hoisted(() => vi.fn());
const mockSafeEqualString = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/tracking', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/email/tracking')>();
  return {
    ...actual,
    verifyTrackingToken: mockVerifyTrackingToken,
    recordEngagement: mockRecordEngagement,
    hashIP: vi.fn(() => 'iphash'),
    inferDeviceType: vi.fn(() => 'desktop'),
    safeEqualString: mockSafeEqualString,
  };
});

vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: mockScheduleAfter,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'user-agent': 'vitest' })),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function clickRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/email/track/click');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe('GET /api/email/track/click (SEC-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockScheduleAfter.mockImplementation((task: () => Promise<void>) => {
      void task();
      return true;
    });
    mockRecordEngagement.mockResolvedValue({ success: true });
    mockSafeEqualString.mockImplementation((a: string, b: string) => a === b);
  });

  it('fails closed with 400 on an invalid token (no external redirect)', async () => {
    mockVerifyTrackingToken.mockReturnValue(null);

    const { GET } = await import('@/app/api/email/track/click/route');
    const response = await GET(
      clickRequest({
        t: 'not-a-valid-token',
        u: 'https://evil.example/phish',
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
    expect(mockScheduleAfter).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid tracking token',
    });
  });

  it('fails closed when query u does not match HMAC-bound clickUrl', async () => {
    mockVerifyTrackingToken.mockReturnValue({
      emailType: 'claim_invite',
      referenceId: 'ref-1',
      email: 'fan@example.com',
      clickUrl: 'https://jov.ie/safe',
    });

    const { GET } = await import('@/app/api/email/track/click/route');
    const response = await GET(
      clickRequest({
        t: 'valid-looking-token',
        u: 'https://evil.example/phish',
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
    expect(mockScheduleAfter).not.toHaveBeenCalled();
  });

  it('allows first-party destinations for legacy unbound tokens', async () => {
    mockVerifyTrackingToken.mockReturnValue({
      emailType: 'claim_invite',
      referenceId: 'ref-1',
      email: 'fan@example.com',
    });

    const { GET } = await import('@/app/api/email/track/click/route');
    const response = await GET(
      clickRequest({
        t: 'legacy-token-without-url',
        u: 'https://jov.ie/claim/abc',
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://jov.ie/claim/abc');
    expect(mockScheduleAfter).toHaveBeenCalledOnce();
  });

  it('fails closed for unbound tokens pointing at non-first-party hosts', async () => {
    mockVerifyTrackingToken.mockReturnValue({
      emailType: 'claim_invite',
      referenceId: 'ref-1',
      email: 'fan@example.com',
    });

    const { GET } = await import('@/app/api/email/track/click/route');
    const response = await GET(
      clickRequest({
        t: 'legacy-token-without-url',
        u: 'https://evil.example/phish',
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
    expect(mockScheduleAfter).not.toHaveBeenCalled();
  });

  it('redirects to the HMAC-bound destination on a valid token', async () => {
    const destination = 'https://jov.ie/claim/abc';
    mockVerifyTrackingToken.mockReturnValue({
      emailType: 'claim_invite',
      referenceId: 'ref-1',
      email: 'fan@example.com',
      messageId: 'msg-1',
      clickUrl: destination,
    });

    const { GET } = await import('@/app/api/email/track/click/route');
    const response = await GET(
      clickRequest({
        t: 'valid-token',
        u: destination,
        l: 'cta',
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(destination);
    expect(mockScheduleAfter).toHaveBeenCalledOnce();
  });

  it('rejects non-http(s) redirect targets before token checks', async () => {
    const { GET } = await import('@/app/api/email/track/click/route');
    const response = await GET(
      clickRequest({
        t: 'any-token',
        u: 'javascript:alert(1)',
      })
    );

    expect(response.status).toBe(400);
    expect(mockVerifyTrackingToken).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBeNull();
  });
});
