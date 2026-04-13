import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClearPendingClaimContext,
  mockGetOptionalAuth,
  mockGetProfileByUsername,
  mockReadPendingClaimContext,
  mockWritePendingClaimContext,
} = vi.hoisted(() => ({
  mockClearPendingClaimContext: vi.fn(),
  mockGetOptionalAuth: vi.fn(),
  mockGetProfileByUsername: vi.fn(),
  mockReadPendingClaimContext: vi.fn(),
  mockWritePendingClaimContext: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/lib/claim/context', () => ({
  clearPendingClaimContext: mockClearPendingClaimContext,
  readPendingClaimContext: mockReadPendingClaimContext,
  writePendingClaimContext: mockWritePendingClaimContext,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  clearLeadAttributionCookie: vi.fn(),
  lookupLeadByClaimToken: vi.fn(),
  markLeadClaimPageViewedFromToken: vi.fn(),
  setLeadAttributionCookieFromToken: vi.fn(),
}));

vi.mock('@/lib/security/claim-token', () => ({
  hashClaimToken: vi.fn(),
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: mockGetProfileByUsername,
  isClaimTokenValid: vi.fn(),
}));

import { GET } from '../../../../../app/[username]/claim/route';

describe('Claim route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalAuth.mockResolvedValue({ userId: null });
    mockReadPendingClaimContext.mockResolvedValue(null);
    mockGetProfileByUsername.mockResolvedValue({
      id: 'profile_1',
      username: 'testartist',
      usernameNormalized: 'testartist',
      displayName: 'Test Artist',
      spotifyId: 'spotify_123',
      spotifyUrl: 'https://open.spotify.com/artist/spotify_123',
      isClaimed: false,
    });
  });

  it('canonicalizes legacy claim routes back to the public profile preview', async () => {
    const response = await GET(
      new NextRequest('http://localhost/TestArtist/claim'),
      {
        params: Promise.resolve({ username: 'TestArtist' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/testartist?claim=1'
    );
    expect(mockGetProfileByUsername).toHaveBeenCalledWith('testartist');
  });

  it('does not clear an unrelated pending claim when a bad token is used', async () => {
    const { isClaimTokenValid } = await import('@/lib/services/profile');

    mockReadPendingClaimContext.mockResolvedValueOnce({
      mode: 'token_backed',
      creatorProfileId: 'other-profile',
      username: 'otherartist',
      claimTokenHash: 'hash',
      leadId: null,
      expectedSpotifyArtistId: 'spotify-other',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    vi.mocked(isClaimTokenValid).mockResolvedValueOnce(false);

    const response = await GET(
      new NextRequest('http://localhost/TestArtist/claim?token=bad-token'),
      {
        params: Promise.resolve({ username: 'TestArtist' }),
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/testartist?claim=1'
    );
    expect(mockClearPendingClaimContext).not.toHaveBeenCalled();
  });
});
