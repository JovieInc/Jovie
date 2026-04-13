import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetOptionalAuth,
  mockGetProfileByUsername,
  mockReadPendingClaimContext,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetOptionalAuth: vi.fn(),
  mockGetProfileByUsername: vi.fn(),
  mockReadPendingClaimContext: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/lib/claim/context', () => ({
  clearPendingClaimContext: vi.fn(),
  readPendingClaimContext: mockReadPendingClaimContext,
  writePendingClaimContext: vi.fn(),
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

import ClaimPage from '../../../../../app/[username]/claim/page';

describe('ClaimPage', () => {
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
    await expect(
      ClaimPage({
        params: Promise.resolve({ username: 'TestArtist' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('REDIRECT:/testartist?claim=1');

    expect(mockGetProfileByUsername).toHaveBeenCalledWith('testartist');
  });
});
