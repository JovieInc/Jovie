import 'server-only';
import { captureError } from '@/lib/error-tracking';
import {
  ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
  ARTIST_SNAPSHOT_ROUTE,
  utcPageviewDay,
} from './contract';
import {
  fetchInstagramSnapshot,
  fetchWikipediaSnapshot,
  fetchYouTubeSnapshot,
} from './fetchers';
import { runArtistDailySnapshots } from './run';
import { drizzleArtistSnapshotStore } from './store';
export async function runLiveArtistDailySnapshots(now = new Date()) {
  return runArtistDailySnapshots({
    now,
    store: drizzleArtistSnapshotStore,
    fetchers: {
      youtube: candidate => fetchYouTubeSnapshot(candidate.youtubeUrl ?? ''),
      instagram: () => fetchInstagramSnapshot(),
      wikipedia: candidate =>
        fetchWikipediaSnapshot({
          musicbrainzId: candidate.musicbrainzId ?? '',
          pageviewDay: utcPageviewDay(now),
        }),
    },
    captureFailure: async ({ failures }) => {
      await captureError(
        'Artist daily snapshots failed',
        new Error(`${failures.length} artist snapshot source failures`),
        {
          fingerprint: ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
          route: ARTIST_SNAPSHOT_ROUTE,
          failureCount: failures.length,
          failures: failures.slice(0, 20),
        }
      );
    },
  });
}
