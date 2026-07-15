import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSessionContext: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  ensureLibraryAssetShareSettings: vi.fn(),
  updateLibraryAssetShareVisibility: vi.fn(),
  getLibraryAssetShareForAsset: vi.fn(),
  loadArtistHandleForProfile: vi.fn(),
  revokeLibraryAssetShareToken: vi.fn(),
}));

const captureErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: authMocks.requireAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: authMocks.getSessionContext,
}));

vi.mock('@/lib/library/asset-share.server', () => ({
  ensureLibraryAssetShareSettings: serviceMocks.ensureLibraryAssetShareSettings,
  updateLibraryAssetShareVisibility:
    serviceMocks.updateLibraryAssetShareVisibility,
  getLibraryAssetShareForAsset: serviceMocks.getLibraryAssetShareForAsset,
  loadArtistHandleForProfile: serviceMocks.loadArtistHandleForProfile,
  revokeLibraryAssetShareToken: serviceMocks.revokeLibraryAssetShareToken,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

const OWNED_PROFILE_ID = '11111111-1111-4111-8111-111111111111';

const mutationBody = {
  profileId: OWNED_PROFILE_ID,
  assetId: 'release_123',
  itemKind: 'release' as const,
  title: 'Midnight City',
  smartLinkPath: '/tim/midnight-city',
};

describe('/api/library/asset-share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAuth.mockResolvedValue({
      userId: 'clerk_user_1',
      error: null,
    });
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: OWNED_PROFILE_ID },
    });
    serviceMocks.loadArtistHandleForProfile.mockResolvedValue('tim');
  });

  describe('POST (ensure share link)', () => {
    it('returns 403 and never calls ensureLibraryAssetShareSettings for a profile the caller does not own', async () => {
      authMocks.getSessionContext.mockResolvedValue({
        profile: { id: 'someone-elses-profile-id' },
      });

      const { POST } = await import('@/app/api/library/asset-share/route');
      const response = await POST(
        new NextRequest('http://localhost/api/library/asset-share', {
          method: 'POST',
          body: JSON.stringify(mutationBody),
        })
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'Creator profile not found',
      });
      expect(
        serviceMocks.ensureLibraryAssetShareSettings
      ).not.toHaveBeenCalled();
    });

    it('wires the request into ensureLibraryAssetShareSettings and returns { ok: true, share } (happy path)', async () => {
      const share = {
        assetId: 'release_123',
        visibility: 'private',
        shareSlug: 'midnight-city',
        accessToken: 'token-abc',
        shareUrl: 'https://jov.ie/p/token-abc',
      };
      serviceMocks.ensureLibraryAssetShareSettings.mockResolvedValue(share);

      const { POST } = await import('@/app/api/library/asset-share/route');
      const response = await POST(
        new NextRequest('http://localhost/api/library/asset-share', {
          method: 'POST',
          body: JSON.stringify(mutationBody),
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, share });
      expect(serviceMocks.ensureLibraryAssetShareSettings).toHaveBeenCalledWith(
        {
          creatorProfileId: OWNED_PROFILE_ID,
          assetId: 'release_123',
          itemKind: 'release',
          title: 'Midnight City',
          artistHandle: 'tim',
          smartLinkPath: '/tim/midnight-city',
        }
      );
    });
  });

  describe('PATCH (update visibility)', () => {
    const patchBody = { ...mutationBody, visibility: 'public' as const };

    it('returns 403 and never calls updateLibraryAssetShareVisibility for a profile the caller does not own', async () => {
      authMocks.getSessionContext.mockResolvedValue({
        profile: { id: 'someone-elses-profile-id' },
      });

      const { PATCH } = await import('@/app/api/library/asset-share/route');
      const response = await PATCH(
        new NextRequest('http://localhost/api/library/asset-share', {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        })
      );

      expect(response.status).toBe(403);
      expect(
        serviceMocks.updateLibraryAssetShareVisibility
      ).not.toHaveBeenCalled();
    });

    it('wires the request into updateLibraryAssetShareVisibility and returns { ok: true, share } (happy path)', async () => {
      const share = {
        assetId: 'release_123',
        visibility: 'public',
        shareSlug: 'midnight-city',
        accessToken: 'token-abc',
        shareUrl: 'https://jov.ie/a/tim/midnight-city',
      };
      serviceMocks.updateLibraryAssetShareVisibility.mockResolvedValue(share);

      const { PATCH } = await import('@/app/api/library/asset-share/route');
      const response = await PATCH(
        new NextRequest('http://localhost/api/library/asset-share', {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, share });
      expect(
        serviceMocks.updateLibraryAssetShareVisibility
      ).toHaveBeenCalledWith({
        creatorProfileId: OWNED_PROFILE_ID,
        assetId: 'release_123',
        itemKind: 'release',
        title: 'Midnight City',
        smartLinkPath: '/tim/midnight-city',
        visibility: 'public',
        artistHandle: 'tim',
      });
    });
  });

  describe('GET (fetch share settings)', () => {
    it('returns 400 when profileId or assetId is missing', async () => {
      const { GET } = await import('@/app/api/library/asset-share/route');
      const response = await GET(
        new NextRequest(
          `http://localhost/api/library/asset-share?profileId=${OWNED_PROFILE_ID}`
        )
      );

      expect(response.status).toBe(400);
      expect(serviceMocks.getLibraryAssetShareForAsset).not.toHaveBeenCalled();
    });

    it('returns 403 and never calls getLibraryAssetShareForAsset for a profile the caller does not own', async () => {
      authMocks.getSessionContext.mockResolvedValue({
        profile: { id: 'someone-elses-profile-id' },
      });

      const { GET } = await import('@/app/api/library/asset-share/route');
      const response = await GET(
        new NextRequest(
          `http://localhost/api/library/asset-share?profileId=${OWNED_PROFILE_ID}&assetId=release_123`
        )
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'Creator profile not found',
      });
      expect(serviceMocks.getLibraryAssetShareForAsset).not.toHaveBeenCalled();
    });

    it('returns { ok: true, share: null } when no share settings exist yet', async () => {
      serviceMocks.getLibraryAssetShareForAsset.mockResolvedValue(null);

      const { GET } = await import('@/app/api/library/asset-share/route');
      const response = await GET(
        new NextRequest(
          `http://localhost/api/library/asset-share?profileId=${OWNED_PROFILE_ID}&assetId=release_123`
        )
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        share: null,
      });
    });

    it('returns the share for an owned asset with an exact response shape (happy path)', async () => {
      const share = {
        assetId: 'release_123',
        visibility: 'private',
        shareSlug: 'midnight-city',
        accessToken: 'token-abc',
        shareUrl: 'https://jov.ie/p/token-abc',
      };
      serviceMocks.getLibraryAssetShareForAsset.mockResolvedValue(share);

      const { GET } = await import('@/app/api/library/asset-share/route');
      const response = await GET(
        new NextRequest(
          `http://localhost/api/library/asset-share?profileId=${OWNED_PROFILE_ID}&assetId=release_123`
        )
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, share });
      expect(serviceMocks.getLibraryAssetShareForAsset).toHaveBeenCalledWith({
        creatorProfileId: OWNED_PROFILE_ID,
        assetId: 'release_123',
        artistHandle: 'tim',
      });
    });

    it('returns 500 without leaking data when the stored visibility is invalid', async () => {
      serviceMocks.getLibraryAssetShareForAsset.mockResolvedValue({
        assetId: 'release_123',
        visibility: 'not-a-real-visibility',
      });

      const { GET } = await import('@/app/api/library/asset-share/route');
      const response = await GET(
        new NextRequest(
          `http://localhost/api/library/asset-share?profileId=${OWNED_PROFILE_ID}&assetId=release_123`
        )
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid share visibility',
      });
    });
  });
});

describe('/api/library/asset-share/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAuth.mockResolvedValue({
      userId: 'clerk_user_1',
      error: null,
    });
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: OWNED_PROFILE_ID },
    });
    serviceMocks.loadArtistHandleForProfile.mockResolvedValue('tim');
  });

  it('returns 403 and never revokes a token for a profile the caller does not own', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: 'someone-elses-profile-id' },
    });
    const { revokeLibraryAssetShareToken } = await import(
      '@/lib/library/asset-share.server'
    );

    const { POST } = await import('@/app/api/library/asset-share/revoke/route');
    const response = await POST(
      new NextRequest('http://localhost/api/library/asset-share/revoke', {
        method: 'POST',
        body: JSON.stringify(mutationBody),
      })
    );

    expect(response.status).toBe(403);
    expect(revokeLibraryAssetShareToken).not.toHaveBeenCalled();
  });
});
