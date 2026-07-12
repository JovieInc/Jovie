import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClearLeadAttributionCookie,
  mockGetProfileByUsername,
  mockHashClaimToken,
  mockIsClaimTokenValid,
  mockLookupLeadByClaimToken,
  mockLookupUsernameByClaimToken,
  mockMarkLeadClaimPageViewedFromToken,
  mockSetLeadAttributionCookieFromToken,
  mockWritePendingClaimContext,
  mockClaimLimit,
  mockGetClientIP,
} = vi.hoisted(() => ({
  mockClearLeadAttributionCookie: vi.fn(),
  mockGetProfileByUsername: vi.fn(),
  mockHashClaimToken: vi.fn(),
  mockIsClaimTokenValid: vi.fn(),
  mockLookupLeadByClaimToken: vi.fn(),
  mockLookupUsernameByClaimToken: vi.fn(),
  mockMarkLeadClaimPageViewedFromToken: vi.fn(),
  mockSetLeadAttributionCookieFromToken: vi.fn(),
  mockWritePendingClaimContext: vi.fn(),
  mockClaimLimit: vi.fn(),
  mockGetClientIP: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  claimTokenAccessLimiter: { limit: mockClaimLimit },
  getClientIP: mockGetClientIP,
  createRateLimitHeaders: (result: { readonly reset?: number }) => ({
    'retry-after': String(result.reset ?? 60),
  }),
  // Faithful mirror of the real helper's contract: a degraded/unavailable
  // backend downgrades a hard block to an advisory allow (fail-open).
  allowIfRateLimitBackendDegraded: (result: {
    readonly success: boolean;
    readonly degraded?: boolean;
    readonly unavailable?: boolean;
  }) =>
    !result.success && (result.degraded === true || result.unavailable === true)
      ? { ...result, success: true }
      : result,
}));

vi.mock('@/lib/claim/context', () => ({
  writePendingClaimContext: mockWritePendingClaimContext,
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  clearLeadAttributionCookie: mockClearLeadAttributionCookie,
  lookupLeadByClaimToken: mockLookupLeadByClaimToken,
  markLeadClaimPageViewedFromToken: mockMarkLeadClaimPageViewedFromToken,
  setLeadAttributionCookieFromToken: mockSetLeadAttributionCookieFromToken,
}));

vi.mock('@/lib/security/claim-token', () => ({
  hashClaimToken: mockHashClaimToken,
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: mockGetProfileByUsername,
}));

vi.mock('@/lib/services/profile/queries', () => ({
  isClaimTokenValid: mockIsClaimTokenValid,
  lookupUsernameByClaimToken: mockLookupUsernameByClaimToken,
}));

import { GET } from '../../../app/claim/[token]/route';

describe('Claim token route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIP.mockReturnValue('203.0.113.7');
    mockClaimLimit.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: 60,
    });
    mockLookupLeadByClaimToken.mockResolvedValue(null);
    mockHashClaimToken.mockResolvedValue('hashed-token');
    mockGetProfileByUsername.mockResolvedValue({
      id: 'profile_1',
      usernameNormalized: 'testartist',
      spotifyId: 'spotify_123',
    });
  });

  it('redirects invalid tokens to the public profile preview instead of throwing', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('testartist');
    mockIsClaimTokenValid.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/claim/not-a-real-token'),
      {
        params: Promise.resolve({ token: 'not-a-real-token' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/testartist?claim=1'
    );
    expect(mockClearLeadAttributionCookie).toHaveBeenCalledTimes(1);
    expect(mockWritePendingClaimContext).not.toHaveBeenCalled();
  });

  it('stores claim context and redirects valid tokens to the public profile preview', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('testartist');
    mockIsClaimTokenValid.mockResolvedValue(true);
    mockLookupLeadByClaimToken.mockResolvedValue({ id: 'lead_1' });

    const response = await GET(
      new NextRequest('http://localhost/claim/valid-token'),
      {
        params: Promise.resolve({ token: 'valid-token' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/testartist?claim=1'
    );
    expect(mockSetLeadAttributionCookieFromToken).toHaveBeenCalledWith(
      'valid-token'
    );
    expect(mockMarkLeadClaimPageViewedFromToken).toHaveBeenCalledWith(
      'valid-token'
    );
    expect(mockWritePendingClaimContext).toHaveBeenCalledWith({
      mode: 'token_backed',
      creatorProfileId: 'profile_1',
      username: 'testartist',
      claimTokenHash: 'hashed-token',
      leadId: 'lead_1',
      expectedSpotifyArtistId: 'spotify_123',
    });
  });

  it('redirects to root with no token provided (early exit, no side effects)', async () => {
    const response = await GET(new NextRequest('http://localhost/claim/'), {
      params: Promise.resolve({ token: '' }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
    expect(mockLookupUsernameByClaimToken).not.toHaveBeenCalled();
    expect(mockWritePendingClaimContext).not.toHaveBeenCalled();
  });

  it('clears attribution and redirects to root when username lookup fails for token', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/claim/missing-user-token'),
      {
        params: Promise.resolve({ token: 'missing-user-token' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
    expect(mockClearLeadAttributionCookie).toHaveBeenCalledTimes(1);
    expect(mockWritePendingClaimContext).not.toHaveBeenCalled();
  });

  it('clears attribution and redirects to root when profile lookup fails after valid token', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('ghostartist');
    mockIsClaimTokenValid.mockResolvedValue(true);
    mockGetProfileByUsername.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/claim/valid-but-no-profile'),
      {
        params: Promise.resolve({ token: 'valid-but-no-profile' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
    expect(mockClearLeadAttributionCookie).toHaveBeenCalledTimes(1);
    expect(mockWritePendingClaimContext).not.toHaveBeenCalled();
  });

  it('returns 429 without touching the database when the IP is over the limit', async () => {
    mockClaimLimit.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: 60,
    });

    const response = await GET(
      new NextRequest('http://localhost/claim/valid-token'),
      {
        params: Promise.resolve({ token: 'valid-token' }),
      }
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    // Throttle short-circuits before any DB/lead/cookie work.
    expect(mockLookupUsernameByClaimToken).not.toHaveBeenCalled();
    expect(mockIsClaimTokenValid).not.toHaveBeenCalled();
    expect(mockGetProfileByUsername).not.toHaveBeenCalled();
    expect(mockLookupLeadByClaimToken).not.toHaveBeenCalled();
    expect(mockSetLeadAttributionCookieFromToken).not.toHaveBeenCalled();
    expect(mockWritePendingClaimContext).not.toHaveBeenCalled();
  });

  it('keys the limiter by the client IP', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('testartist');
    mockIsClaimTokenValid.mockResolvedValue(true);

    await GET(new NextRequest('http://localhost/claim/valid-token'), {
      params: Promise.resolve({ token: 'valid-token' }),
    });

    expect(mockClaimLimit).toHaveBeenCalledWith('203.0.113.7');
  });

  it('fails open (proceeds) when the rate-limit backend is degraded', async () => {
    mockClaimLimit.mockResolvedValue({
      success: false,
      degraded: true,
      limit: 20,
      remaining: 0,
      reset: 60,
    });
    mockLookupUsernameByClaimToken.mockResolvedValue('testartist');
    mockIsClaimTokenValid.mockResolvedValue(true);

    const response = await GET(
      new NextRequest('http://localhost/claim/valid-token'),
      {
        params: Promise.resolve({ token: 'valid-token' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/testartist?claim=1'
    );
    expect(mockWritePendingClaimContext).toHaveBeenCalledTimes(1);
  });
});
