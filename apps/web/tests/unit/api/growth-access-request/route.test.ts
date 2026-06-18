import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());
const mockGetClientIP = vi.hoisted(() => vi.fn());
const mockSelectLimit = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockNotifySlackGrowthRequest = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: mockLimit },
  getClientIP: mockGetClientIP,
  createRateLimitHeaders: () => ({ 'X-RateLimit-Limit': '60' }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mockSelectLimit }) }),
    }),
    update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
  },
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackGrowthRequest: mockNotifySlackGrowthRequest,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

function requestWith(body: unknown): Request {
  return new Request('http://localhost/api/growth-access-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/growth-access-request', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockRequireAuth.mockResolvedValue({ userId: 'clerk_1', error: null });
    mockGetClientIP.mockReturnValue('127.0.0.1');
    mockLimit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: new Date(Date.now() + 60_000),
    });
    // Already requested -> route returns 409 before any write, keeping the
    // happy-path test focused on the limiter wiring.
    mockSelectLimit.mockResolvedValue([
      {
        id: 'user_1',
        name: 'Test User',
        email: 'test@example.com',
        plan: 'free',
        growthAccessRequestedAt: new Date(),
      },
    ]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockNotifySlackGrowthRequest.mockResolvedValue(undefined);
  });

  it('rate-limits by authenticated user id', async () => {
    const { POST } = await import('@/app/api/growth-access-request/route');

    await POST(requestWith({ reason: 'Smart links sound great' }));

    expect(mockLimit).toHaveBeenCalledWith('clerk_1');
  });

  it('returns 429 before touching the database when the limiter rejects', async () => {
    mockLimit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const { POST } = await import('@/app/api/growth-access-request/route');

    const response = await POST(
      requestWith({ reason: 'Smart links sound great' })
    );

    expect(response.status).toBe(429);
    expect(mockSelectLimit).not.toHaveBeenCalled();
    expect(mockNotifySlackGrowthRequest).not.toHaveBeenCalled();
  });
});
