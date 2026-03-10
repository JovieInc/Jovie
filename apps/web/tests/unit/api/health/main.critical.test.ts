import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHealthLimiterLimit = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  healthLimiter: {
    limit: mockHealthLimiterLimit,
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  },
}));

describe('@critical GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockHealthLimiterLimit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(Date.now() + 60000),
    });
  });

  it('returns 429 when rate limited', async () => {
    mockHealthLimiterLimit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 60000),
      reason: 'Rate limit exceeded',
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost/api/health'));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe('Too many requests');
  });

  it('returns ok status when database is healthy', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost/api/health'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.database).toBe('ok');
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('captures warning when database check throws', async () => {
    mockDbSelect.mockImplementation(() => {
      throw new Error('Connection refused');
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Health check degraded',
      expect.any(Error),
      expect.objectContaining({ service: 'health', route: '/api/health' })
    );
  });
});
