// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/spotify/client', () => ({ spotifyClient: { requestJson } }));

import {
  fetchSpotifyPopularity,
  fetchYouTubeViews,
} from '@/lib/track-snapshots/fetchers';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('snapshot provider requests', () => {
  it('batches Spotify requests and preserves relinked identities without inventing missing values', async () => {
    requestJson.mockResolvedValue({
      tracks: [
        null,
        { id: 'missing' },
        { id: 'playable', linked_from: { id: 'original' }, popularity: 0 },
      ],
    });
    const result = await fetchSpotifyPopularity(
      Array.from({ length: 51 }, (_, i) => `track${i}`)
    );
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(requestJson.mock.calls[1][0]).toBe('/tracks?ids=track50&market=US');
    expect(result).toEqual(
      new Map([
        ['playable', 0],
        ['original', 0],
      ])
    );
  });
  it('requires the YouTube credential and surfaces provider errors', async () => {
    vi.stubEnv('YOUTUBE_DATA_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchYouTubeViews(['aaaaaaaaaaa'])).rejects.toThrow(
      'youtube_data_api_key_unset'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('YOUTUBE_DATA_API_KEY', 'isolated-fixture-key');
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchYouTubeViews(['aaaaaaaaaaa'])).rejects.toThrow(
      'youtube_http_503'
    );
  });
  it('batches YouTube requests and omits unavailable counts', async () => {
    vi.stubEnv('YOUTUBE_DATA_API_KEY', 'isolated-fixture-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'a', statistics: { viewCount: '0' } },
          { id: 'b' },
          { id: 'c', statistics: { viewCount: 'unknown' } },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await fetchYouTubeViews(Array.from({ length: 51 }, (_, i) => String(i)))
    ).toEqual(new Map([['a', 0]]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0].searchParams.get('id')).toBe('50');
  });
});
