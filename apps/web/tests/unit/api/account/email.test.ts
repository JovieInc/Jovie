import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/account/email/route';

const mockRateLimitHeaders = vi.hoisted(() => vi.fn(() => ({})));
const mockCheckAccountEmailRateLimit = vi.hoisted(() => vi.fn());
const mockGetClientIP = vi.hoisted(() => vi.fn(() => '203.0.113.1'));

const dbMock = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where };
});

const clerkClientMock = vi.hoisted(() => ({
  users: {
    getUser: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => clerkClientMock,
}));

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
    update: dbMock.update,
  },
  users: {},
  eq: vi.fn(),
}));

const mockGetUserByClerkId = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: mockGetUserByClerkId,
}));

describe('POST /api/account/email', () => {
  const mockGetUser = clerkClientMock.users.getUser;
  const { update, set } = dbMock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckAccountEmailRateLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60_000,
    });
    mockRateLimitHeaders.mockReturnValue({});
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
      body: JSON.stringify({ email: 'hello@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('requires the email to exist on the Clerk user', async () => {
    mockGetUser.mockResolvedValue({ emailAddresses: [] });

    const request = new NextRequest('http://localhost/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'hello@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('requires the email to be verified', async () => {
    mockGetUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'hello@example.com',
          verification: { status: 'pending' },
        },
      ],
    });

    const request = new NextRequest('http://localhost/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'hello@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the local database when the email is verified', async () => {
    mockGetUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'hello@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    mockGetUserByClerkId.mockResolvedValue({
      id: 'internal_user_id',
      clerkId: 'user_123',
      email: 'old@example.com',
    });

    const request = new NextRequest('http://localhost/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'hello@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      email: 'hello@example.com',
      updatedAt: expect.any(Date),
    });
  });
});
