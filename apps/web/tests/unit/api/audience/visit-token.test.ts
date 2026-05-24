import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublicVisitLimiterLimit = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockGetClientTrackingToken = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockExtractClientIP = vi.hoisted(() =>
  vi.fn().mockReturnValue('127.0.0.1')
);
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  publicVisitLimiter: {
    limit: mockPublicVisitLimiterLimit,
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'profile-id-column' },
}));

vi.mock('@/lib/analytics/tracking-token', () => ({
  getClientTrackingToken: mockGetClientTrackingToken,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mockExtractClientIP,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const { GET } = await import('@/app/api/audience/visit-token/route');

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function buildRequest(profileId: string | null): NextRequest {
  const url = new URL('http://localhost/api/audience/visit-token');
  if (profileId !== null) {
    url.searchParams.set('profileId', profileId);
  }
  return new NextRequest(url);
}

function mockProfileLookup(profile: { id: string } | null) {
  const limit = vi.fn().mockResolvedValue(profile ? [profile] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValue({ from });
  return { limit, where, from };
}

function passingRateLimit() {
  mockPublicVisitLimiterLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: new Date(Date.now() + 60_000),
  });
}

describe('GET /api/audience/visit-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractClientIP.mockReturnValue('127.0.0.1');
  });

  it('returns 400 when profileId is malformed', async () => {
    passingRateLimit();
    const response = await GET(buildRequest('not-a-uuid'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Invalid request' });
    // Must not consume DB or signing on bad input
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockGetClientTrackingToken).not.toHaveBeenCalled();
  });

  it('returns 400 when profileId is missing entirely', async () => {
    passingRateLimit();
    const response = await GET(buildRequest(null));
    expect(response.status).toBe(400);
  });

  it('returns 429 with Retry-After when the IP is rate-limited (closes Greptile P1: visit-token unauth abuse vector)', async () => {
    mockPublicVisitLimiterLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 30_000),
    });

    const response = await GET(buildRequest(VALID_UUID));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    // Importantly: no DB lookup or token mint when rate-limited
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockGetClientTrackingToken).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile UUID does not exist (closes Greptile P1: caller-supplied UUID minted tokens)', async () => {
    passingRateLimit();
    mockProfileLookup(null);

    const response = await GET(buildRequest(VALID_UUID));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'Not found' });
    // Must not mint a token for a nonexistent profile
    expect(mockGetClientTrackingToken).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns a signed token for a real profile under the rate limit', async () => {
    passingRateLimit();
    mockProfileLookup({ id: VALID_UUID });
    mockGetClientTrackingToken.mockReturnValue({
      token: 'signed-token-abc',
      expiresAt: 1_700_000_000_000,
    });

    const response = await GET(buildRequest(VALID_UUID));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      token: 'signed-token-abc',
      expiresAt: 1_700_000_000_000,
    });
    expect(mockGetClientTrackingToken).toHaveBeenCalledWith(VALID_UUID);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('captures and reports profile-lookup failures (closes CodeRabbit Major: silent failure swallowing)', async () => {
    passingRateLimit();
    const dbError = new Error('connection refused');
    const limit = vi.fn().mockRejectedValue(dbError);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mockDbSelect.mockReturnValue({ from });

    const response = await GET(buildRequest(VALID_UUID));

    expect(response.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[visit-token] profile lookup failed',
      dbError
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'visit-token profile lookup failed',
      dbError,
      expect.objectContaining({ route: '/api/audience/visit-token' })
    );
  });

  it('captures and reports token-signing failures while preserving fallback shape (closes CodeRabbit Major: silent token-mint swallowing)', async () => {
    passingRateLimit();
    mockProfileLookup({ id: VALID_UUID });
    const signingError = new Error('TRACKING_TOKEN_SECRET missing');
    mockGetClientTrackingToken.mockImplementation(() => {
      throw signingError;
    });

    const response = await GET(buildRequest(VALID_UUID));

    expect(response.status).toBe(500);
    const body = await response.json();
    // Existing clients (which read `token` defensively) must still degrade
    // gracefully — the fallback shape is part of the contract.
    expect(body).toEqual({ token: null, expiresAt: null });
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[visit-token] signing failed',
      signingError
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'visit-token signing failed',
      signingError,
      expect.objectContaining({ route: '/api/audience/visit-token' })
    );
  });
});
