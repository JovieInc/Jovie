import 'server-only';
import { spotifyClient } from '@/lib/spotify/client';
import type { TrackSnapshotFetchers } from './run';

const BATCH = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

interface SpotifyTracksResponse {
  tracks: Array<{
    id: string;
    popularity?: number;
    linked_from?: { id: string };
  } | null>;
}

export async function fetchSpotifyPopularity(
  ids: readonly string[]
): Promise<ReadonlyMap<string, number>> {
  const result = new Map<string, number>();
  for (const batch of chunk(ids, BATCH)) {
    const data = await spotifyClient.requestJson<SpotifyTracksResponse>(
      `/tracks?ids=${batch.join(',')}&market=US`
    );
    for (const track of data.tracks) {
      if (!track || typeof track.popularity !== 'number') continue;
      result.set(track.id, track.popularity);
      // Relinked tracks report the playable id; keep the id we stored too.
      if (track.linked_from?.id) {
        result.set(track.linked_from.id, track.popularity);
      }
    }
  }
  return result;
}

interface YouTubeVideosResponse {
  items?: Array<{ id: string; statistics?: { viewCount?: string } }>;
}

export async function fetchYouTubeViews(
  ids: readonly string[]
): Promise<ReadonlyMap<string, number>> {
  const result = new Map<string, number>();
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('youtube_data_api_key_unset');
  for (const batch of chunk(ids, BATCH)) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`youtube_http_${response.status}`);
    const data = (await response.json()) as YouTubeVideosResponse;
    for (const item of data.items ?? []) {
      const count = Number(item.statistics?.viewCount);
      if (Number.isFinite(count)) result.set(item.id, count);
    }
  }
  return result;
}

export const liveTrackSnapshotFetchers: TrackSnapshotFetchers = {
  spotifyPopularity: fetchSpotifyPopularity,
  youtubeViews: fetchYouTubeViews,
};
