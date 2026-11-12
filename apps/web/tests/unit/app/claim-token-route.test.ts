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

const mockRecordArtistOfferStage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mockRecordArtistOfferStage,
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
  readPendingClaimContext: vi.fn(async () => ({
    mode: 'token_backed',
    creatorProfileId: 'profile-1',
    username: 'claimableartist',
    claimTokenHash: 'synthetic-hash',
  })),
  clearPendingClaimContext: vi.fn(),
  applyPendingClaimCookie: (
    response: {
      cookies: { set: (name: string, value: string) => void };
    },
    _context: unknown
  ) => {
    response.cookies.set('jovie_pending_claim', 'attached');
    return response;
  },
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
  isClaimTokenValid: mockIsClaimTokenValid,
}));

vi.mock('@/lib/services/profile/queries', () => ({
  isClaimTokenValid: mockIsClaimTokenValid,
  lookupUsernameByClaimToken: mockLookupUsernameByClaimToken,
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: vi.fn(async () => ({ userId: null })),
}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { claimHrefWithAttribution } from '@/lib/claim/attribution';
import { GET as claimAuth } from '../../../app/[username]/claim/route';
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
      usernameNormalized: 'claimableartist',
      spotifyId: 'spotify_123',
    });
  });

  it('redirects invalid tokens to the public profile preview instead of throwing', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('claimableartist');
    mockIsClaimTokenValid.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/claim/not-a-real-token'),
      {
        params: Promise.resolve({ token: 'not-a-real-token' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/claimableartist?claim=1'
    );
    expect(mockClearLeadAttributionCookie).toHaveBeenCalledTimes(1);
    expect(mockWritePendingClaimContext).not.toHaveBeenCalled();
    // An invalid token is not a claim-link open.
    expect(mockRecordArtistOfferStage).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'preserves safe attribution for public=%s without forwarding unsafe parameters',
    async isPublic => {
      mockLookupUsernameByClaimToken.mockResolvedValue('claimableartist');
      mockIsClaimTokenValid.mockResolvedValue(true);
      mockGetProfileByUsername.mockResolvedValue({
        id: 'profile-1',
        usernameNormalized: 'claimableartist',
        spotifyId: null,
        isPublic,
      });
      const response = await GET(
        new NextRequest(
          'https://jov.ie/claim/synthetic-token?utm_source=claim_link&utm_medium=dm&utm_campaign=claim-link-outreach&redirect_url=https://evil.example&email=person@example.com&utm_content=person%40example.com'
        ),
        { params: Promise.resolve({ token: 'synthetic-token' }) }
      );
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.searchParams.get('utm_campaign')).toBe(
        'claim-link-outreach'
      );
      expect(redirectUrl.searchParams.get('utm_source')).toBe('claim_link');
      expect(redirectUrl.searchParams.get('utm_medium')).toBe('dm');
      expect(redirectUrl.searchParams.has('redirect_url')).toBe(false);
      expect(redirectUrl.searchParams.has('email')).toBe(false);
      expect(redirectUrl.searchParams.has('utm_content')).toBe(false);
      expect(redirectUrl.origin).toBe('https://jov.ie');
      expect(response.cookies.getAll().map(cookie => cookie.name)).toEqual([
        'jovie_pending_claim',
      ]);
      expect(mockRecordArtistOfferStage).toHaveBeenCalledWith(
        undefined,
        'claim-link-open'
      );
      const handoff = isPublic
        ? new URL(
            claimHrefWithAttribution(
              '/claimableartist/claim?next=auth',
              redirectUrl.searchParams
            ),
            redirectUrl.origin
          )
        : redirectUrl;
      const signup = await claimAuth(new NextRequest(handoff), {
        params: Promise.resolve({ username: 'claimableartist' }),
      });
      const signupUrl = new URL(signup.headers.get('location')!);
      expect(signupUrl.pathname).toBe('/signup');
      expect(signupUrl.searchParams.get('utm_campaign')).toBe(
        'claim-link-outreach'
      );
      expect(signupUrl.searchParams.get('utm_source')).toBe('claim_link');
      expect(signupUrl.searchParams.get('utm_medium')).toBe('dm');
      expect(signupUrl.searchParams.has('token')).toBe(false);
      expect(signupUrl.searchParams.has('email')).toBe(false);
      const afterSignup = new URL(
        signupUrl.searchParams.get('redirect_url')!,
        signupUrl.origin
      );
      expect(afterSignup.pathname).toBe('/start');
      expect(afterSignup.searchParams.get('utm_campaign')).toBe(
        'claim-link-outreach'
      );
      expect(afterSignup.searchParams.has('token')).toBe(false);
      expect(
        signup.cookies
          .getAll()
          .every(cookie => cookie.name === 'jovie_pending_claim')
      ).toBe(true);
    }
  );

  it('stores claim context and redirects valid tokens to the public profile preview', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('claimableartist');
    mockIsClaimTokenValid.mockResolvedValue(true);
    mockLookupLeadByClaimToken.mockResolvedValue({ id: 'lead_1' });

    const response = await GET(
      new NextRequest('http://localhost/claim/valid-token', {
        headers: {
          cookie: 'jv_acquisition_id=9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
        },
      }),
      {
        params: Promise.resolve({ token: 'valid-token' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/claimableartist?claim=1'
    );
    expect(mockRecordArtistOfferStage).toHaveBeenCalledWith(
      '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
      'claim-link-open'
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
      username: 'claimableartist',
      claimTokenHash: 'hashed-token',
      leadId: 'lead_1',
      expectedSpotifyArtistId: 'spotify_123',
    });
    expect(response.cookies.get('jovie_pending_claim')?.value).toBe('attached');
  });

  it('admits the dedicated fixture only after token verification', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('e2eclaimartist');
    mockIsClaimTokenValid.mockResolvedValue(true);
    mockGetProfileByUsername.mockResolvedValue({
      id: 'fixture-profile',
      usernameNormalized: 'e2eclaimartist',
      spotifyId: 'fixture_spotify',
    });

    const response = await GET(
      new NextRequest('http://localhost/claim/fixture-token'),
      { params: Promise.resolve({ token: 'fixture-token' }) }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/e2eclaimartist?claim=1'
    );

    const loopbackResponse = await GET(
      new NextRequest('http://127.0.0.1:3100/claim/fixture-token', {
        headers: { host: '127.0.0.1:3100' },
      }),
      { params: Promise.resolve({ token: 'fixture-token' }) }
    );
    expect(loopbackResponse.headers.get('location')).toBe(
      'http://127.0.0.1:3100/e2eclaimartist?claim=1'
    );
    expect(mockIsClaimTokenValid).toHaveBeenCalledWith(
      'e2eclaimartist',
      'fixture-token'
    );
    expect(mockWritePendingClaimContext).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'token_backed',
        creatorProfileId: 'fixture-profile',
        username: 'e2eclaimartist',
        claimTokenHash: 'hashed-token',
      })
    );
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

  it('refuses claim tokens for protected synthetic identities without claim side effects', async () => {
    mockLookupUsernameByClaimToken.mockResolvedValue('testartist');

    const response = await GET(
      new NextRequest('http://localhost/claim/synthetic-token'),
      { params: Promise.resolve({ token: 'synthetic-token' }) }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
    expect(mockClearLeadAttributionCookie).toHaveBeenCalledOnce();
    expect(mockIsClaimTokenValid).not.toHaveBeenCalled();
    expect(mockSetLeadAttributionCookieFromToken).not.toHaveBeenCalled();
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
    mockLookupUsernameByClaimToken.mockResolvedValue('claimableartist');
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
    mockLookupUsernameByClaimToken.mockResolvedValue('claimableartist');
    mockIsClaimTokenValid.mockResolvedValue(true);

    const response = await GET(
      new NextRequest('http://localhost/claim/valid-token'),
      {
        params: Promise.resolve({ token: 'valid-token' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/claimableartist?claim=1'
    );
    expect(mockWritePendingClaimContext).toHaveBeenCalledTimes(1);
  });
});
