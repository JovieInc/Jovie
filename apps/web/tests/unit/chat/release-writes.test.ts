import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  whereMock: vi.fn().mockResolvedValue({ rowCount: 0 }),
  setMock: vi.fn().mockReturnValue({ where: vi.fn() }),
  updateMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    metadata: 'metadata',
    generatedPitches: 'generatedPitches',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
}));

describe('owned release writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.setMock.mockReturnValue({ where: hoisted.whereMock });
    hoisted.updateMock.mockReturnValue({ set: hoisted.setMock });
  });

  it('ownedReleaseWhere requires both release id and creator profile id', async () => {
    const { ownedReleaseWhere } = await import('@/lib/chat/release-writes');
    const { and, eq } = await import('drizzle-orm');
    const { discogReleases } = await import('@/lib/db/schema/content');

    ownedReleaseWhere('release-1', 'profile-1');

    expect(and).toHaveBeenCalledWith(
      eq(discogReleases.id, 'release-1'),
      eq(discogReleases.creatorProfileId, 'profile-1')
    );
  });

  it('updateOwnedReleaseGeneratedPitches fails when profile ownership does not match', async () => {
    const { updateOwnedReleaseGeneratedPitches } = await import(
      '@/lib/chat/release-writes'
    );

    const updated = await updateOwnedReleaseGeneratedPitches({
      releaseId: 'release-1',
      creatorProfileId: 'profile-a',
      generatedPitches: {
        target: 'playlist',
        platform: 'spotify',
        destinationLabel: 'Spotify Editorial',
        audience: 'indie listeners',
        subjectLine: null,
        body: 'pitch',
        generatedAt: '2026-06-11T00:00:00.000Z',
        modelUsed: 'test-model',
      },
    });

    expect(updated).toBe(false);
    expect(hoisted.whereMock).toHaveBeenCalled();
  });

  it('updateOwnedReleaseGeneratedPitches succeeds when ownership matches', async () => {
    hoisted.whereMock.mockResolvedValueOnce({ rowCount: 1 });
    const { updateOwnedReleaseGeneratedPitches } = await import(
      '@/lib/chat/release-writes'
    );

    const updated = await updateOwnedReleaseGeneratedPitches({
      releaseId: 'release-1',
      creatorProfileId: 'profile-a',
      generatedPitches: {
        target: 'playlist',
        platform: 'spotify',
        destinationLabel: 'Spotify Editorial',
        audience: 'indie listeners',
        subjectLine: null,
        body: 'pitch',
        generatedAt: '2026-06-11T00:00:00.000Z',
        modelUsed: 'test-model',
      },
    });

    expect(updated).toBe(true);
  });
});
