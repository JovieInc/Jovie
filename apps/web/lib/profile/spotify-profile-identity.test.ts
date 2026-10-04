import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { assertSpotifyProfileIdentityAvailable } from './spotify-profile-identity';

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
