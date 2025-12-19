import { describe, expect, it, vi } from 'vitest';
import { processJob } from '@/lib/ingestion/processor';
import { syncSpotifyDiscography } from '@/lib/ingestion/spotify-discography';

vi.mock('@/lib/ingestion/spotify-discography', () => ({
  syncSpotifyDiscography: vi.fn(),
}));

describe('processJob - Spotify discography ingestion', () => {
  it('updates profile ingestion status during Spotify discography sync', async () => {
    const syncMock = vi.mocked(syncSpotifyDiscography);
    syncMock.mockResolvedValue({
      releasesFetched: 2,
      releasesUpserted: 2,
      tracksUpserted: 5,
    });

    const profileId = '11111111-1111-4111-8111-111111111111';

    const updateWhereMock = vi.fn().mockResolvedValue([{ id: profileId }]);
    const setMock = vi.fn(() => ({ where: updateWhereMock }));
    const updateMock = vi.fn(() => ({ set: setMock }));

    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              { id: profileId, spotifyId: 'spotify-1' },
            ]),
          })),
        })),
      })),
      update: updateMock,
    } as unknown as Parameters<typeof processJob>[0];

    await processJob(tx, {
      id: 'job-1',
      jobType: 'import_spotify_discography',
      payload: { creatorProfileId: profileId, spotifyId: 'spotify-1' },
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      runAt: new Date(),
      priority: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        spotifyId: 'spotify-1',
        tx,
      })
    );

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ ingestionStatus: 'processing' })
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ ingestionStatus: 'idle' })
    );
  });
});
