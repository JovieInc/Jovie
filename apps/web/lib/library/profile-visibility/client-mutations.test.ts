import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateLibraryProfileVisibility } from './client-mutations';

describe('updateLibraryProfileVisibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the typed visibility from the canonical mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          assetId: 'release-1',
          profileVisibility: 'hidden',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateLibraryProfileVisibility({
        profileId: 'profile-1',
        assetId: 'release-1',
        itemKind: 'release',
        profileVisibility: 'hidden',
      })
    ).resolves.toBe('hidden');
  });

  it('rejects share-link privacy values returned as profile visibility', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ profileVisibility: 'private' }), {
          status: 200,
        })
      )
    );

    await expect(
      updateLibraryProfileVisibility({
        profileId: 'profile-1',
        assetId: 'release-1',
        itemKind: 'release',
        profileVisibility: 'hidden',
      })
    ).rejects.toThrow('Profile visibility update missing payload');
  });
});
