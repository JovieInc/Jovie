import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHealthLimiterGetStatus = vi.hoisted(() => vi.fn());
const mockHealthLimiterLimit = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  healthLimiter: {
    getStatus: mockHealthLimiterGetStatus,
    limit: mockHealthLimiterLimit,
  },
  createRateLimitHeadersFromStatus: vi.fn().mockReturnValue({}),
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

vi.mock('@/lib/env-server', () => ({
  env: {
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  },
}));

describe('@critical GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockHealthLimiterGetStatus.mockReturnValue({
      blocked: false,
      limit: 30,
      remaining: 29,
      resetTime: Date.now() + 60000,
      retryAfterSeconds: 0,
    });
    mockHealthLimiterLimit.mockResolvedValue({ success: true });
  });

  it('returns 429 when rate limited', async () => {
    mockHealthLimiterGetStatus.mockReturnValue({
      blocked: true,
      limit: 30,
      remaining: 0,
      resetTime: Date.now() + 60000,
      retryAfterSeconds: 60,
    });

    const { GET } = await import('@/app/api/health/route');
    const request = new Request('http://localhost/api/health');

    const response = await GET(request);
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
    const request = new Request('http://localhost/api/health');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.database).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  it('returns degraded status when database fails', async () => {
    mockDbSelect.mockImplementation(() => {
      throw new Error('Connection refused');
    });

    const { GET } = await import('@/app/api/health/route');
    const request = new Request('http://localhost/api/health');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.database).toBe('error');
    expect(data.timestamp).toBeDefined();
  });
});
