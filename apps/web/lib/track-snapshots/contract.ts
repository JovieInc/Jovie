/**
 * Per-song daily snapshots for the catalog-reactivation proof.
 * Runs only for allowlisted usernames (default: tim). Kill switch:
 * TRACK_DAILY_SNAPSHOTS=false. Failures use one fingerprint.
 */
export const TRACK_SNAPSHOT_ROUTE = '/api/cron/track-daily-snapshots' as const;
export const TRACK_SNAPSHOT_REMEDIATION_FINGERPRINT =
  'remediation:track-snapshots' as const;
export const TRACK_SNAPSHOT_DEFAULT_USERNAMES = ['tim'] as const;
export const TRACK_SNAPSHOT_MAX_PROFILES = 10;

const OFF_VALUES = new Set(['0', 'false', 'off', 'no']);

export function isTrackDailySnapshotsEnabled(
  raw: string | undefined = process.env.TRACK_DAILY_SNAPSHOTS
): boolean {
  if (!raw?.trim()) return true;
  return !OFF_VALUES.has(raw.trim().toLowerCase());
}

/** Comma-separated usernames; unset means the default allowlist. */
export function resolveTrackSnapshotUsernames(
  raw: string | undefined = process.env.TRACK_DAILY_SNAPSHOT_USERNAMES
): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  const names = parsed.length ? parsed : [...TRACK_SNAPSHOT_DEFAULT_USERNAMES];
  return [...new Set(names)].slice(0, TRACK_SNAPSHOT_MAX_PROFILES);
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function utcPreviousDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extract a video id from watch, youtu.be, shorts or music.youtube.com URLs. */
export function parseYouTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'music.youtube.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') candidate = url.searchParams.get('v');
    else if (parts[0] === 'shorts' || parts[0] === 'embed')
      candidate = parts[1] ?? null;
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}
