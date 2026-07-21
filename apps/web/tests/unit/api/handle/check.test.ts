import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnforceHandleCheckRateLimit = vi.hoisted(() => vi.fn());
const mockExtractClientIP = vi.hoisted(() => vi.fn());
const mockGetCachedHandleAvailability = vi.hoisted(() => vi.fn());
const mockCacheHandleAvailability = vi.hoisted(() => vi.fn());
const mockCheckOnboardingHandleAvailability = vi.hoisted(() => vi.fn());

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

vi.mock('@/lib/onboarding/reserved-handle', () => ({
  checkOnboardingHandleAvailability: mockCheckOnboardingHandleAvailability,
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
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'available-handle',
      available: true,
      reason: 'available',
    });
  });

  it('returns 400 when handle is missing', async () => {
    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request('http://localhost/api/handle/check');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toBe('Handle is required');
    expect(mockCheckOnboardingHandleAvailability).not.toHaveBeenCalled();
  });

  it('returns 400 when handle is too short via canonical helper', async () => {
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'ab',
      available: false,
      reason: 'invalid_format',
      error: 'Username must be at least 3 characters',
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request('http://localhost/api/handle/check?handle=ab');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('at least 3');
  });

  it('returns 400 when handle is too long via canonical helper', async () => {
    const longHandle = 'a'.repeat(31);
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: longHandle,
      available: false,
      reason: 'invalid_format',
      error: 'Username must be no more than 30 characters',
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      `http://localhost/api/handle/check?handle=${longHandle}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('no more than 30');
  });

  it('returns 400 when handle has invalid characters via canonical helper', async () => {
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'test@user',
      available: false,
      reason: 'invalid_format',
      error:
        'Username can only contain letters, numbers, hyphens, underscores, and dots',
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=test%40user'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('letters, numbers');
  });

  it('accepts dotted handles and returns available true', async () => {
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'real.name',
      available: true,
      reason: 'available',
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=real.name'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(mockCacheHandleAvailability).toHaveBeenCalledWith('real.name', true);
  });

  it('accepts underscored handles and returns available true', async () => {
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'real_name',
      available: true,
      reason: 'available',
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=real_name'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(mockCacheHandleAvailability).toHaveBeenCalledWith('real_name', true);
  });

  it('rejects reserved handles before DB via canonical helper', async () => {
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'admin',
      available: false,
      reason: 'reserved',
      error: 'This handle is reserved',
      suggestedAlternatives: ['admin1', 'admin2', 'admin3'],
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=admin'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.suggestedAlternatives).toEqual(['admin1', 'admin2', 'admin3']);
  });

  it('uses cached availability when present and still surfaces alternatives when taken', async () => {
    mockGetCachedHandleAvailability.mockResolvedValue(false);

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=cachedhandle'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(false);
    expect(data.suggestedAlternatives?.[0]).toMatch(/^cachedhandle\d+$/);
    expect(mockCheckOnboardingHandleAvailability).not.toHaveBeenCalled();
  });

  it('returns available true when handle is not taken', async () => {
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'available-handle',
      available: true,
      reason: 'available',
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=available-handle'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(data.suggestedAlternatives).toBeUndefined();
    expect(mockCacheHandleAvailability).toHaveBeenCalledWith(
      'available-handle',
      true
    );
  });

  it('returns available false with suggestedAlternatives when taken', async () => {
    mockCheckOnboardingHandleAvailability.mockResolvedValue({
      handle: 'takenhandle',
      available: false,
      reason: 'taken',
      suggestedAlternatives: ['takenhandle1', 'takenhandle2', 'takenhandle3'],
    });

    const { GET } = await import('@/app/api/handle/check/route');
    const request = new Request(
      'http://localhost/api/handle/check?handle=takenhandle'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(false);
    expect(data.reason).toBe('taken');
    expect(data.suggestedAlternatives).toEqual([
      'takenhandle1',
      'takenhandle2',
      'takenhandle3',
    ]);
    expect(mockCacheHandleAvailability).toHaveBeenCalledWith(
      'takenhandle',
      false
    );
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
