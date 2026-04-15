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
});
