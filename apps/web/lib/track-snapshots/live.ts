import 'server-only';
import { captureError } from '@/lib/error-tracking';
import {
  resolveTrackSnapshotUsernames,
  TRACK_SNAPSHOT_REMEDIATION_FINGERPRINT,
  TRACK_SNAPSHOT_ROUTE,
} from './contract';
import { liveTrackSnapshotFetchers } from './fetchers';
import { runTrackDailySnapshots } from './run';
import { drizzleTrackSnapshotStore } from './store';

export async function runLiveTrackDailySnapshots(now = new Date()) {
  const report = await runTrackDailySnapshots({
    now,
    usernames: resolveTrackSnapshotUsernames(),
    store: drizzleTrackSnapshotStore,
    fetchers: liveTrackSnapshotFetchers,
  });
  if (report.failures.length > 0) {
    await captureError(
      'Track daily snapshots failed',
      new Error(`${report.failures.length} track snapshot source failures`),
      {
        fingerprint: TRACK_SNAPSHOT_REMEDIATION_FINGERPRINT,
        route: TRACK_SNAPSHOT_ROUTE,
        failures: report.failures.slice(0, 20),
      }
    );
  }
  return report;
}
