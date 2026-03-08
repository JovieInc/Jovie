import { describe, expect, it, vi } from 'vitest';

const mockInvalidateProfileCache = vi.hoisted(() => vi.fn());
const mockGenerateClaimTokenPair = vi.hoisted(() => vi.fn());
const mockCalculateAndStoreFitScore = vi.hoisted(() => vi.fn());

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfileCache,
}));

vi.mock('@/lib/security/claim-token', () => ({
  generateClaimTokenPair: mockGenerateClaimTokenPair,
}));

vi.mock('@/lib/fit-scoring', () => ({
  calculateAndStoreFitScore: mockCalculateAndStoreFitScore,
}));

import { createNewSocialProfile } from './social-platform-flow';

describe('createNewSocialProfile', () => {
  it('invalidates public profile cache after creating a new public profile', async () => {
    mockGenerateClaimTokenPair.mockResolvedValue({
      token: 'claim-token',
      tokenHash: 'claim-token-hash',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    mockCalculateAndStoreFitScore.mockResolvedValue(undefined);

    const insertCreatorReturning = vi.fn().mockResolvedValue([
      {
        id: 'profile-1',
        username: 'artistone',
        usernameNormalized: 'artistone',
      },
    ]);

    const insertCreatorValues = vi.fn(() => ({
      returning: insertCreatorReturning,
    }));

    const insertSocialValues = vi.fn().mockResolvedValue(undefined);

    const insert = vi
      .fn()
      .mockImplementationOnce(() => ({ values: insertCreatorValues }))
      .mockImplementationOnce(() => ({ values: insertSocialValues }));

    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ maxOrder: 0 }]),
        })),
      });

    const response = await createNewSocialProfile(
      {
        insert,
        select,
      } as never,
      'artistone',
      {
        handle: 'artist-one',
        normalizedHandle: 'artist-one',
        platformId: 'instagram',
        platformName: 'Instagram',
        normalizedUrl: 'https://instagram.com/artist-one',
        spotifyArtistName: null,
        spotifyData: null,
      }
    );

    expect(response.status).toBe(200);
    expect(mockInvalidateProfileCache).toHaveBeenCalledWith('artistone');
    expect(mockInvalidateProfileCache).toHaveBeenCalledTimes(1);
  });
});
