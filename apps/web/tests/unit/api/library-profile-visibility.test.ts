import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSessionContext: vi.fn(),
}));

const mutationMocks = vi.hoisted(() => ({
  invalidateProfileCache: vi.fn(),
  upsertLibraryProfileVisibility: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: authMocks.requireAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: authMocks.getSessionContext,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mutationMocks.invalidateProfileCache,
}));

vi.mock('@/lib/library/profile-visibility.server', () => ({
  upsertLibraryProfileVisibility: mutationMocks.upsertLibraryProfileVisibility,
}));

describe('/api/library/profile-visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user_123',
      error: null,
    });
    authMocks.getSessionContext.mockResolvedValue({
      profile: {
        id: '11111111-1111-4111-8111-111111111111',
        usernameNormalized: 'tim',
      },
    });
    mutationMocks.upsertLibraryProfileVisibility.mockResolvedValue('hidden');
    mutationMocks.invalidateProfileCache.mockResolvedValue(undefined);
  });

  it('updates profile visibility for the owned creator profile', async () => {
    const { PATCH } = await import(
      '@/app/api/library/profile-visibility/route'
    );
    const response = await PATCH(
      new NextRequest('http://localhost/api/library/profile-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          assetId: 'release_123',
          itemKind: 'release',
          profileVisibility: 'hidden',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assetId: 'release_123',
      profileVisibility: 'hidden',
    });
    expect(mutationMocks.upsertLibraryProfileVisibility).toHaveBeenCalledWith({
      creatorProfileId: '11111111-1111-4111-8111-111111111111',
      assetId: 'release_123',
      itemKind: 'release',
      profileVisibility: 'hidden',
    });
    expect(mutationMocks.invalidateProfileCache).toHaveBeenCalledWith('tim');
  });

  it('rejects a profile the session does not own', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: {
        id: '22222222-2222-4222-8222-222222222222',
        usernameNormalized: 'other',
      },
    });

    const { PATCH } = await import(
      '@/app/api/library/profile-visibility/route'
    );
    const response = await PATCH(
      new NextRequest('http://localhost/api/library/profile-visibility', {
        method: 'PATCH',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          assetId: 'release_123',
          itemKind: 'release',
          profileVisibility: 'hidden',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(mutationMocks.upsertLibraryProfileVisibility).not.toHaveBeenCalled();
    expect(mutationMocks.invalidateProfileCache).not.toHaveBeenCalled();
  });

  it('does not accept share-link privacy as profile visibility', async () => {
    const { PATCH } = await import(
      '@/app/api/library/profile-visibility/route'
    );
    const response = await PATCH(
      new NextRequest('http://localhost/api/library/profile-visibility', {
        method: 'PATCH',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          assetId: 'release_123',
          itemKind: 'release',
          profileVisibility: 'private',
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mutationMocks.upsertLibraryProfileVisibility).not.toHaveBeenCalled();
  });
});
