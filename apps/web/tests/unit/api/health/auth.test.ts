import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitStatus: vi.fn().mockReturnValue({
    limit: 30,
    remaining: 29,
    resetTime: Date.now() + 60000,
  }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

describe('GET /api/health/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCheckRateLimit.mockReturnValue(false);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const { GET } = await import('@/app/api/health/auth/route');
    const request = new Request('http://localhost/api/health/auth');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBeDefined();
  });

  it('returns healthy status when auth is working', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/health/auth/route');
    const request = new Request('http://localhost/api/health/auth');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.service).toBe('auth');
  });

  it('returns error status when auth fails', async () => {
    mockAuth.mockRejectedValue(new Error('Clerk unavailable'));

    const { GET } = await import('@/app/api/health/auth/route');
    const request = new Request('http://localhost/api/health/auth');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.ok).toBe(false);
  });
});
