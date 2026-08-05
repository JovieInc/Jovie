import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetOptionalAuth,
  mockGetProfileByUsername,
  mockReadPendingClaimContext,
  mockClearPendingClaimContext,
  mockWritePendingClaimContext,
} = vi.hoisted(() => ({
  mockGetOptionalAuth: vi.fn(),
  mockGetProfileByUsername: vi.fn(),
  mockReadPendingClaimContext: vi.fn(),
  mockClearPendingClaimContext: vi.fn(),
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
      settings: {},
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

  it('redirects to / for invalid username (length or pattern)', async () => {
    const { GET } = await import('../../../../../app/[username]/claim/route'); // re-import safe
    const response = await GET(
      new NextRequest(
        'http://localhost/thisusernameiswaytoolongandinvalid/claim'
      ),
      {
        params: Promise.resolve({
          username: 'thisusernameiswaytoolongandinvalid',
        }),
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
  });

  it('redirects to / when profile not found', async () => {
    mockGetProfileByUsername.mockResolvedValueOnce(null);
    const response = await GET(
      new NextRequest('http://localhost/ghost/claim'),
      { params: Promise.resolve({ username: 'ghost' }) }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
  });

  it('does not issue direct-claim proof for an automatic unclaimed profile', async () => {
    mockGetProfileByUsername.mockResolvedValueOnce({
      id: 'profile_1',
      username: 'a_unclaimed',
      usernameNormalized: 'a_unclaimed',
      displayName: 'Austin Leeds',
      spotifyId: 'spotify_123',
      spotifyUrl: 'https://open.spotify.com/artist/spotify_123',
      isClaimed: false,
      settings: {
        unclaimedArtistProfile: {
          state: 'unclaimed',
          source: 'structured_spotify_release_credit',
          artistRegistryId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
          provider: 'spotify',
          providerArtistId: 'spotify_123',
          ownershipVerified: false,
          representationVerified: false,
          consentObtained: false,
        },
      },
    });

    const response = await GET(
      new NextRequest('http://localhost/a_unclaimed/claim?next=auth'),
      { params: Promise.resolve({ username: 'a_unclaimed' }) }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/a_unclaimed?claim=unsupported'
    );
    expect(mockClearPendingClaimContext).toHaveBeenCalled();
    expect(mockWritePendingClaimContext).not.toHaveBeenCalled();
  });
});
