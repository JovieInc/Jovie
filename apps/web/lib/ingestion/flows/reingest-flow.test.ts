import { describe, expect, it, vi } from 'vitest';

const mockInvalidateProfileCache = vi.hoisted(() => vi.fn());
const mockGenerateClaimTokenPair = vi.hoisted(() => vi.fn());
const mockProcessProfileExtraction = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfileCache,
}));

vi.mock('@/lib/security/claim-token', () => ({
  generateClaimTokenPair: mockGenerateClaimTokenPair,
}));

vi.mock('./profile-processing', () => ({
  processProfileExtraction: mockProcessProfileExtraction,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

import { handleNewProfileIngest } from './reingest-flow';

describe('handleNewProfileIngest', () => {
  it('invalidates public profile cache after creating a new public profile', async () => {
    mockGenerateClaimTokenPair.mockResolvedValue({
      token: 'claim-token',
      tokenHash: 'claim-token-hash',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    mockProcessProfileExtraction.mockResolvedValue({ mergeError: null });

    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'profile-2',
              username: 'artisttwo',
              usernameNormalized: 'artisttwo',
              displayName: 'Artist Two',
              avatarUrl: null,
              isClaimed: false,
              claimTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
              avatarLockedByUser: false,
              displayNameLocked: false,
            },
          ]),
        })),
      })),
    };

    mockWithSystemIngestionSession.mockImplementation(async operation =>
      operation(tx)
    );

    const response = await handleNewProfileIngest({
      finalHandle: 'artisttwo',
      displayName: 'Artist Two',
      hostedAvatarUrl: null,
      extraction: {
        links: [],
      } as never,
    });

    expect(response.status).toBe(200);
    expect(mockInvalidateProfileCache).toHaveBeenCalledWith('artisttwo');
    expect(mockInvalidateProfileCache).toHaveBeenCalledTimes(1);
  });
});
