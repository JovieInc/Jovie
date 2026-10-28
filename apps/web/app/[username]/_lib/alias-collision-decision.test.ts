import { describe, expect, it, vi } from 'vitest';
import {
  type AliasCollisionLookups,
  decideLegacyAliasCollision,
} from './alias-collision-decision';

function lookups(
  overrides: Partial<AliasCollisionLookups> = {}
): AliasCollisionLookups {
  return {
    getCreatorByUsername: vi.fn(async () => ({
      id: 'creator-1',
      usernameNormalized: 'dualipa',
    })),
    hasContentCandidate: vi.fn(async () => false),
    getContentBySlug: vi.fn(async () => null),
    findRedirectByOldSlug: vi.fn(async () => null),
    getUnpublishedReleasePresence: vi.fn(async () => null),
    ...overrides,
  };
}

describe('decideLegacyAliasCollision', () => {
  it('stays on the mode page when the alias is a definite miss', async () => {
    await expect(
      decideLegacyAliasCollision('DuaLipa', 'listen', lookups())
    ).resolves.toEqual({ action: 'stay' });
  });

  it('returns to published music instead of the listen mode', async () => {
    await expect(
      decideLegacyAliasCollision(
        'dualipa',
        'music',
        lookups({
          hasContentCandidate: vi.fn(async () => true),
          getContentBySlug: vi.fn(async () => ({ id: 'track-music' })),
        })
      )
    ).resolves.toEqual({ action: 'content' });
  });

  it('keeps a renamed release ahead of the mode alias', async () => {
    await expect(
      decideLegacyAliasCollision(
        'dualipa',
        'music',
        lookups({
          findRedirectByOldSlug: vi.fn(async () => ({
            currentSlug: 'renamed-music',
          })),
        })
      )
    ).resolves.toEqual({
      action: 'renamed',
      location: '/dualipa/renamed-music',
    });
  });

  it('keeps an unpublished collision on the smart-link URL', async () => {
    await expect(
      decideLegacyAliasCollision(
        'dualipa',
        'music',
        lookups({
          getUnpublishedReleasePresence: vi.fn(async () => ({
            id: 'unpublished-music',
          })),
        })
      )
    ).resolves.toEqual({ action: 'content' });
  });

  it('does not turn a failed collision lookup into a mode stay', async () => {
    await expect(
      decideLegacyAliasCollision(
        'dualipa',
        'listen',
        lookups({
          findRedirectByOldSlug: vi.fn(async () => {
            throw new Error('collision lookup unavailable');
          }),
        })
      )
    ).rejects.toThrow('collision lookup unavailable');
  });
});
