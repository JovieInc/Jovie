import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookiesGet = vi.hoisted(() => vi.fn());
const mockDbLimit = vi.hoisted(() => vi.fn());
const mockDbSet = vi.hoisted(() => vi.fn());
const mockDbValues = vi.hoisted(() => vi.fn());
const mockDbOnConflictDoUpdate = vi.hoisted(() => vi.fn());
const mockGeneralLimiterLimit = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...clauses: unknown[]) => ({ clauses, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
  gt: vi.fn((left: unknown, right: unknown) => ({ left, op: 'gt', right })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookiesGet,
  })),
}));

vi.mock('@/app/api/notifications/route-helpers', () => ({
  createRateLimitedResponse: vi.fn(
    () =>
      new Response(JSON.stringify({ success: false, code: 'rate_limited' }), {
        status: 429,
      })
  ),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: mockDbLimit,
    update: vi.fn().mockReturnThis(),
    set: mockDbSet,
    insert: vi.fn().mockReturnThis(),
    values: mockDbValues,
  },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  publicProfileCaptureDismissals: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    audienceId: 'audience_id',
    sessionCount: 'session_count',
    source: 'source',
    dismissedAt: 'dismissed_at',
    nextEligibleAt: 'next_eligible_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('@/lib/env-server', () => ({
  isSecureEnv: vi.fn(() => false),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: {
    limit: mockGeneralLimiterLimit,
  },
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

const artistId = '123e4567-e89b-12d3-a456-426614174000';

function getRequest(cookie?: string) {
  return new NextRequest(
    `http://localhost/api/profile/capture-dismissal?artist_id=${artistId}`,
    {
      headers: cookie ? { cookie } : undefined,
    }
  );
}

function postRequest(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost/api/profile/capture-dismissal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('/api/profile/capture-dismissal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookiesGet.mockReturnValue(undefined);
    mockDbLimit.mockResolvedValue([]);
    mockDbSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockDbValues.mockReturnValue({
      onConflictDoUpdate: mockDbOnConflictDoUpdate,
    });
    mockDbOnConflictDoUpdate.mockResolvedValue(undefined);
    mockGeneralLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('returns the empty eligible state and issues an audience cookie', async () => {
    const { GET } = await import('@/app/api/profile/capture-dismissal/route');

    const response = await GET(getRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      suppressed: false,
      sessionCount: 0,
      nextEligibleAt: null,
    });
    expect(response.headers.get('set-cookie')).toContain('jv_aid=');
  });

  it('persists a seven-day dismissal on the anonymous audience id', async () => {
    mockCookiesGet.mockReturnValue({ value: 'audience-123' });
    const { POST } = await import('@/app/api/profile/capture-dismissal/route');

    const response = await POST(
      postRequest({ artist_id: artistId, source: 'profile_inline' })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.suppressed).toBe(true);
    expect(data.nextEligibleAt).toEqual(expect.any(String));
    expect(mockDbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: artistId,
        audienceId: 'audience-123',
        sessionCount: 0,
        source: 'profile_inline',
        nextEligibleAt: expect.any(Date),
      })
    );
    expect(mockDbOnConflictDoUpdate).toHaveBeenCalled();
  });

  it('suppresses and increments while below the three-session cap', async () => {
    mockCookiesGet.mockReturnValue({ value: 'audience-123' });
    const nextEligibleAt = new Date(Date.now() + 86_400_000);
    mockDbLimit.mockResolvedValue([
      { id: 'dismissal-1', sessionCount: 2, nextEligibleAt },
    ]);
    const { GET } = await import('@/app/api/profile/capture-dismissal/route');

    const response = await GET(getRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.suppressed).toBe(true);
    expect(data.sessionCount).toBe(2);
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionCount: 3,
        updatedAt: expect.any(Date),
      })
    );
  });

  it('stops suppressing after three dismissed sessions', async () => {
    mockCookiesGet.mockReturnValue({ value: 'audience-123' });
    mockDbLimit.mockResolvedValue([
      {
        id: 'dismissal-1',
        sessionCount: 3,
        nextEligibleAt: new Date(Date.now() + 86_400_000),
      },
    ]);
    const { GET } = await import('@/app/api/profile/capture-dismissal/route');

    const response = await GET(getRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.suppressed).toBe(false);
    expect(mockDbSet).not.toHaveBeenCalled();
  });

  it('returns a retryable server error when dismissal persistence fails', async () => {
    mockDbOnConflictDoUpdate.mockRejectedValue(new Error('db down'));
    const { POST } = await import('@/app/api/profile/capture-dismissal/route');

    const response = await POST(postRequest({ artist_id: artistId }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: 'Unable to save dismissal',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Profile capture dismissal persist failed',
      expect.any(Error),
      expect.objectContaining({ artistId })
    );
  });
});
