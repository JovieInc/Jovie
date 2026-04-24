import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/verification/request/route';

const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockNotifyVerificationRequest = vi.hoisted(() => vi.fn());
const mockCheckVerificationRequestRateLimit = vi.hoisted(() => vi.fn());
const mockCreateRateLimitHeaders = vi.hoisted(() => vi.fn(() => ({})));

const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    clerkId: 'clerkId',
    name: 'name',
    email: 'email',
    isPro: 'isPro',
    deletedAt: 'deletedAt',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'userId',
    usernameNormalized: 'usernameNormalized',
    isVerified: 'isVerified',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and-condition'),
  eq: vi.fn(() => 'eq-condition'),
  isNull: vi.fn(() => 'null-condition'),
}));

vi.mock('@/lib/verification/notifications', () => ({
  notifyVerificationRequest: mockNotifyVerificationRequest,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkVerificationRequestRateLimit: mockCheckVerificationRequestRateLimit,
  createRateLimitHeaders: mockCreateRateLimitHeaders,
}));

describe('POST /api/verification/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckVerificationRequestRateLimit.mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 60_000,
    });
    mockCreateRateLimitHeaders.mockReturnValue({});
    mockWithDbSession.mockImplementation(
      async (callback: (clerkUserId: string) => Promise<NextResponse>) =>
        callback('clerk_123')
    );
    mockLimit
      .mockResolvedValueOnce([
        {
          id: 'user_1',
          clerkId: 'clerk_123',
          name: 'Alex Artist',
          email: 'alex@example.com',
          isPro: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'profile_1',
          usernameNormalized: 'alex',
          isVerified: false,
        },
      ]);

    mockNotifyVerificationRequest.mockResolvedValue({
      status: 'sent',
      detail: 'Message sent to Slack',
    });
  });

  it('returns success when notification sends', async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('fails visibly when notification is skipped', async () => {
    mockNotifyVerificationRequest.mockResolvedValueOnce({
      status: 'skipped',
      detail: 'SLACK_WEBHOOK_URL not configured',
    });

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        'We could not notify our team about your verification request. Please try again in a moment.',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Verification request notification did not send',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/verification/request',
        userId: 'user_1',
        profileId: 'profile_1',
        slackStatus: 'skipped',
      })
    );
  });

  it('fails visibly when notification errors', async () => {
    mockNotifyVerificationRequest.mockResolvedValueOnce({
      status: 'error',
      error: 'Slack API error',
    });

    const response = await POST();

    expect(response.status).toBe(503);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Verification request notification did not send',
      expect.any(Error),
      expect.objectContaining({
        slackStatus: 'error',
      })
    );
  });

  it('captures unexpected route failures', async () => {
    mockWithDbSession.mockRejectedValueOnce(new Error('Database unavailable'));

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Unable to submit verification request',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Verification request route failed',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/verification/request',
      })
    );
  });

  it('returns 429 and skips Slack notification when rate limited', async () => {
    mockCheckVerificationRequestRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 60_000,
      reason:
        'You have submitted too many verification requests. Please try again later.',
    });
    mockCreateRateLimitHeaders.mockReturnValueOnce({
      'X-RateLimit-Limit': '3',
      'X-RateLimit-Remaining': '0',
    });

    const response = await POST();

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
    await expect(response.json()).resolves.toEqual({
      error:
        'You have submitted too many verification requests. Please try again later.',
    });
    // Critical: no Slack fanout when rate limited, and no DB lookup either.
    expect(mockNotifyVerificationRequest).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockCheckVerificationRequestRateLimit).toHaveBeenCalledWith(
      'clerk_123'
    );
  });

  it('does not capture expected unauthorized failures', async () => {
    mockWithDbSession.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockCaptureError).not.toHaveBeenCalledWith(
      'Verification request route failed',
      expect.anything(),
      expect.anything()
    );
  });
});
