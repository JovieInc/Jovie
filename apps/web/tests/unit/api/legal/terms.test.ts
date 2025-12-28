import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue(false),
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitStatus: vi.fn().mockReturnValue({
    limit: 100,
    remaining: 99,
    resetTime: Date.now() + 60000,
  }),
}));

describe('GET /api/legal/terms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns terms of service content', async () => {
    const { GET } = await import('@/app/api/legal/terms/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('content');
    expect(data).toHaveProperty('lastUpdated');
  });
});
