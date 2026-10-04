/** Daily public artist snapshots. Default-off. Failures use one fingerprint. */
export const ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT =
  'remediation:artist-snapshots' as const;
export const ARTIST_SNAPSHOT_ROUTE =
  '/api/cron/artist-daily-snapshots' as const;
export const ARTIST_DAILY_SNAPSHOT_CAP = 25;
export const ARTIST_DAILY_SNAPSHOT_HARD_CAP = 40;
export const ARTIST_SNAPSHOT_PACE_MS = 1_100;
export const SNAPSHOT_PRECISIONS = ['exact', 'rounded'] as const;
export type SnapshotPrecision = (typeof SNAPSHOT_PRECISIONS)[number];
/** Rounded values must not be differenced as growth. */
export function canReadSnapshotAsGrowth(rawValues: {
  readonly precision?: unknown;
}): boolean {
  return rawValues.precision === 'exact';
}
export function isSnapshotPrecision(
  value: unknown
): value is SnapshotPrecision {
  return value === 'exact' || value === 'rounded';
}
const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);
export function isArtistDailySnapshotsEnabled(
  raw: string | undefined = process.env.ARTIST_DAILY_SNAPSHOTS
): boolean {
  if (!raw) return false;
  return ENABLED_VALUES.has(raw.trim().toLowerCase());
}
export function resolveArtistSnapshotCap(
  raw: string | undefined = process.env.ARTIST_DAILY_SNAPSHOT_LIMIT
): number {
  if (!raw?.trim()) return ARTIST_DAILY_SNAPSHOT_CAP;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return ARTIST_DAILY_SNAPSHOT_CAP;
  return Math.min(parsed, ARTIST_DAILY_SNAPSHOT_HARD_CAP);
}
export function utcSnapshotDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
/** Wikimedia pageviews for the current UTC day are incomplete. */
export function utcPageviewDay(now: Date): string {
  return utcSnapshotDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}
export function publicUrlWithoutSecrets(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return null;
  }
}
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'html',
  'cookie',
  'cookies',
  'authorization',
  'set-cookie',
  'setcookie',
  'email',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'session',
]);
export function assertPublicSnapshotPayload(
  value: Record<string, unknown>
): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      throw new Error(`Refusing to store snapshot field ${key}`);
    }
    const field = value[key];
    if (typeof field === 'string' && field.length > 2_000) {
      throw new Error(`Refusing to store oversized snapshot field ${key}`);
    }
  }
}
