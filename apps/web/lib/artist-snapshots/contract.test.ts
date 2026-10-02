import { describe, expect, it } from 'vitest';
import {
  ARTIST_DAILY_SNAPSHOT_CAP,
  ARTIST_DAILY_SNAPSHOT_HARD_CAP,
  ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
  assertPublicSnapshotPayload,
  canReadSnapshotAsGrowth,
  isArtistDailySnapshotsEnabled,
  publicUrlWithoutSecrets,
  resolveArtistSnapshotCap,
  utcPageviewDay,
  utcSnapshotDay,
} from './contract';

describe('artist snapshot flag', () => {
  it('stays off unless the flag is explicitly enabled', () => {
    expect(isArtistDailySnapshotsEnabled(undefined)).toBe(false);
    expect(isArtistDailySnapshotsEnabled('')).toBe(false);
    expect(isArtistDailySnapshotsEnabled('false')).toBe(false);
    expect(isArtistDailySnapshotsEnabled('0')).toBe(false);
    expect(isArtistDailySnapshotsEnabled('true')).toBe(true);
    expect(isArtistDailySnapshotsEnabled(' ON ')).toBe(true);
  });
  it('caps artists per run', () => {
    expect(resolveArtistSnapshotCap(undefined)).toBe(ARTIST_DAILY_SNAPSHOT_CAP);
    expect(resolveArtistSnapshotCap('0')).toBe(ARTIST_DAILY_SNAPSHOT_CAP);
    expect(resolveArtistSnapshotCap('10')).toBe(10);
    expect(resolveArtistSnapshotCap('500')).toBe(
      ARTIST_DAILY_SNAPSHOT_HARD_CAP
    );
  });
  it('uses the previous UTC day for pageviews', () => {
    const now = new Date('2026-10-02T09:15:00.000Z');
    expect(utcSnapshotDay(now)).toBe('2026-10-02');
    expect(utcPageviewDay(now)).toBe('2026-10-01');
  });
  it('strips secrets from public urls and refuses private payload fields', () => {
    expect(
      publicUrlWithoutSecrets(
        'https://www.youtube.com/@artist/about?key=secret&si=1#frag'
      )
    ).toBe('https://www.youtube.com/@artist/about');
    expect(publicUrlWithoutSecrets('http://example.com/a')).toBeNull();
    expect(() => assertPublicSnapshotPayload({ cookie: 'session' })).toThrow(
      /cookie/
    );
    expect(() =>
      assertPublicSnapshotPayload({ html: '<html>private</html>' })
    ).toThrow(/html/);
    expect(ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT).toBe(
      'remediation:artist-snapshots'
    );
  });
  it('treats only exact precision as growth', () => {
    expect(canReadSnapshotAsGrowth({ precision: 'exact' })).toBe(true);
    expect(canReadSnapshotAsGrowth({ precision: 'rounded' })).toBe(false);
    expect(canReadSnapshotAsGrowth({})).toBe(false);
  });
});
