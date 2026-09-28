import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  existing: [] as unknown[],
  createNew: vi.fn(),
  handleExisting: vi.fn(),
  findAvailable: vi.fn(),
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: (op: (tx: unknown) => unknown) =>
    op({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => hoisted.existing }),
        }),
      }),
    }),
}));
vi.mock('@/lib/ingestion/flows/social-platform-flow', () => ({
  createNewSocialProfile: hoisted.createNew,
  handleExistingUnclaimedProfile: hoisted.handleExisting,
}));
vi.mock('@/lib/ingestion/flows/profile-operations', () => ({
  findAvailableHandle: hoisted.findAvailable,
}));
vi.mock('@/lib/ingestion/flows/spotify-integration', () => ({
  fetchSpotifyArtistData: async () => null,
}));
vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueMusicFetchEnrichmentJob: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { ingestSocialPlatformUrl } = await import('./social-platform-ingest');

describe('ingestSocialPlatformUrl collision handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.existing = [
      { id: 'p1', isClaimed: false, usernameNormalized: 'someartist' },
    ];
    hoisted.createNew.mockResolvedValue(NextResponse.json({ ok: true }));
    hoisted.handleExisting.mockResolvedValue(NextResponse.json({ ok: true }));
    hoisted.findAvailable.mockResolvedValue('someartist_1');
  });

  it('merges into an existing unclaimed profile by default (admin path)', async () => {
    await ingestSocialPlatformUrl('https://instagram.com/someartist');
    expect(hoisted.handleExisting).toHaveBeenCalled();
    expect(hoisted.createNew).not.toHaveBeenCalled();
  });

  it('allocates a new handle instead of merging for untrusted callers', async () => {
    await ingestSocialPlatformUrl('https://instagram.com/someartist', {
      allocateNewHandleOnCollision: true,
    });
    expect(hoisted.handleExisting).not.toHaveBeenCalled();
    expect(hoisted.createNew).toHaveBeenCalledWith(
      expect.anything(),
      'someartist_1',
      expect.anything()
    );
  });
});
