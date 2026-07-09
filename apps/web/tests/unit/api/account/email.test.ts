import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/account/email/route';

const mockRateLimitHeaders = vi.hoisted(() => vi.fn(() => ({})));
const mockCheckAccountEmailRateLimit = vi.hoisted(() => vi.fn());
const mockGetClientIP = vi.hoisted(() => vi.fn(() => '203.0.113.1'));

const dbMock = vi.hoisted(() => {
  const limit = vi.fn();
  const whereSelect = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where: whereSelect }));
  const select = vi.fn(() => ({ from }));
  const whereUpdate = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where: whereUpdate }));
  const update = vi.fn(() => ({ set }));
  return { select, from, whereSelect, limit, update, set, whereUpdate };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: vi.fn(
    async (callback: (userId: string) => Promise<Response>) =>
      callback('user_123')
  ),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAccountEmailRateLimit: mockCheckAccountEmailRateLimit,
  createRateLimitHeaders: mockRateLimitHeaders,
  getClientIP: mockGetClientIP,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbMock.select,
    update: dbMock.update,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('POST /api/account/email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckAccountEmailRateLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60_000,
    });
    mockRateLimitHeaders.mockReturnValue({});
    dbMock.limit.mockResolvedValue([{ id: 'user_123' }]);
  });

  it('returns 400 for invalid payloads', async () => {
    const request = new NextRequest('http://localhost/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckAccountEmailRateLimit.mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
      reason: 'Too many email sync requests. Please try again later.',
    });
    mockRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '5',
      'X-RateLimit-Remaining': '0',
    });

    const request = new NextRequest('http://localhost/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'artist@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(429);
  });

  it('returns 404 when the authenticated user row is missing', async () => {
    dbMock.limit.mockResolvedValueOnce([]);

    const request = new NextRequest('http://localhost/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'artist@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('updates the local database when email is valid', async () => {
    const request = new NextRequest('http://localhost/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'artist@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(dbMock.update).toHaveBeenCalled();
    expect(dbMock.set).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'artist@example.com' })
    );
  });
});
