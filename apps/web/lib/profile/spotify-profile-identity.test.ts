import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import {
  assertSpotifyProfileIdentityAvailable,
  hasSpotifyProfileIdentityConflict,
} from './spotify-profile-identity';

// Ownership/uniqueness is a producer contract, separate from the JOV-6543
// shape admission contract: plausible IDs never authorize profile adoption.
describe('Spotify profile identity admission (JOV-7504)', () => {
  it.each([null, 'other-owner', 'current-owner'])(
    'rejects a different exact-ID profile regardless of owner (%s)',
    async owner => {
      const operations: string[] = [];
      const tx = {
        execute: vi.fn(async () => {
          operations.push('lock');
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => {
                operations.push('lookup');
                return [{ id: 'different-profile', userId: owner }];
              },
            }),
          }),
        }),
      };
      await expect(
        assertSpotifyProfileIdentityAvailable(
          tx as unknown as DbOrTransaction,
          '0000000000000000000001',
          'current-profile'
        )
      ).rejects.toMatchObject({
        errorCode: 'SPOTIFY_IDENTITY_CONFLICT',
        status: 409,
      });
      expect(operations).toEqual(['lock', 'lookup']);
    }
  );

  it('allows a free identity after the locked exact-ID lookup', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    };
    await expect(
      assertSpotifyProfileIdentityAvailable(
        tx as unknown as DbOrTransaction,
        '0000000000000000000001',
        null
      )
    ).resolves.toBeUndefined();
  });
});

describe('Read-only onboarding ownership admission', () => {
  const artistId = '0000000000000000000001';
  it.each([
    { owner: null, existing: [], conflicts: [], blocked: false },
    { owner: null, existing: [], conflicts: [{ id: 'public' }], blocked: true },
    { owner: 'owner', existing: [], conflicts: [], blocked: false },
    {
      owner: 'owner',
      existing: [],
      conflicts: [{ id: 'unclaimed' }],
      blocked: true,
    },
    {
      owner: 'owner',
      existing: [{ id: 'mine', spotifyId: artistId }],
      conflicts: [],
      blocked: false,
    },
    {
      owner: 'owner',
      existing: [{ id: 'mine', spotifyId: 'other-artist' }],
      conflicts: [],
      blocked: true,
    },
    {
      owner: 'owner',
      existing: [{ id: 'mine', spotifyId: null }],
      conflicts: [],
      blocked: false,
    },
    {
      owner: 'owner',
      existing: [{ id: 'mine', spotifyId: null }],
      conflicts: [{ id: 'different-owner' }],
      blocked: true,
    },
    {
      owner: 'owner',
      existing: [{ id: 'mine', spotifyId: null }],
      conflicts: [{ id: 'same-owner-other-profile' }],
      blocked: true,
    },
  ])(
    'mirrors mutation admission without ownership changes: %j',
    async ({ owner, existing, conflicts, blocked }) => {
      const limit = vi.fn();
      if (owner) limit.mockResolvedValueOnce(existing);
      limit.mockResolvedValueOnce(conflicts);
      const orderBy = vi.fn(() => ({ limit }));
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ limit, orderBy }) }) }),
        execute: vi.fn(),
        update: vi.fn(),
      };
      await expect(
        hasSpotifyProfileIdentityConflict(
          tx as unknown as DbOrTransaction,
          artistId,
          owner
        )
      ).resolves.toBe(blocked);
      expect(tx.execute).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
      expect(orderBy).toHaveBeenCalledTimes(owner ? 1 : 0);
    }
  );

  it('propagates a failed ownership lookup instead of treating it as free', async () => {
    const tx = {
      select: () => {
        throw new Error('db unavailable');
      },
    };
    await expect(
      hasSpotifyProfileIdentityConflict(
        tx as unknown as DbOrTransaction,
        artistId,
        'owner'
      )
    ).rejects.toThrow('db unavailable');
  });
});
