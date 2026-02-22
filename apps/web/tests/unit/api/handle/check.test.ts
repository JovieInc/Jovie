import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockEnforceHandleCheckRateLimit = vi.hoisted(() => vi.fn());
const mockExtractClientIP = vi.hoisted(() => vi.fn());
const mockGetCachedHandleAvailability = vi.hoisted(() => vi.fn());
const mockCacheHandleAvailability = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceHandleCheckRateLimit: mockEnforceHandleCheckRateLimit,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mockExtractClientIP,
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  getCachedHandleAvailability: mockGetCachedHandleAvailability,
  cacheHandleAvailability: mockCacheHandleAvailability,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));

describe('GET /api/handle/check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExtractClientIP.mockReturnValue('127.0.0.1');
    mockEnforceHandleCheckRateLimit.mockResolvedValue(undefined);
    mockGetCachedHandleAvailability.mockResolvedValue(null);
    mockCacheHandleAvailability.mockResolvedValue(undefined);
  });

  it('returns 400 when handle is missing', async () => {
    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request('http://localhost/api/handle/check');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toBe('Handle is required');
  });

  it('returns 400 when handle is too short', async () => {
    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request('http://localhost/api/handle/check?handle=ab');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('at least 3');
  });

  it('returns 400 when handle is too long', async () => {
    const { GET } = await import('@/app/api/handle/check/route');
    const longHandle = 'a'.repeat(31);
    const request = new Request(
      `http://localhost/api/handle/check?handle=${longHandle}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('less than 30');
  });

  it('returns 400 when handle has invalid characters', async () => {
    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=test@user'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('letters, numbers, and hyphens');
  });

  it('uses cached availability when present', async () => {
    mockGetCachedHandleAvailability.mockResolvedValue(true);

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=cachedhandle'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns available true when handle is not taken', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=available-handle'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(mockCacheHandleAvailability).toHaveBeenCalledWith(
      'available-handle',
      true
    );
  });

  it('returns available false when handle is taken', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ username: 'takenhandle' }]),
        }),
      }),
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=takenhandle'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(false);
  });

  it('returns 429 when rate limited', async () => {
    mockEnforceHandleCheckRateLimit.mockRejectedValue(
      new Error('RATE_LIMITED')
    );

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=testhandle'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.available).toBe(false);
  });
});
