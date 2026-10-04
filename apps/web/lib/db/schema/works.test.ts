import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  recordingArtists,
  releaseArtists,
} from './content';
import {
  workCredits,
  workItemCredits,
  workItemPlacements,
  workItems,
  works,
} from './works';

describe('generic works schema facade (JOV-7631)', () => {
  it('exposes generic handles over the music-specific tables', () => {
    expect(works).toBe(discogReleases);
    expect(workItems).toBe(discogRecordings);
    expect(workItemPlacements).toBe(discogReleaseTracks);
    expect(workCredits).toBe(releaseArtists);
    expect(workItemCredits).toBe(recordingArtists);
  });

  it('keeps physical table names until the JOV-7323 rename', () => {
    expect(getTableName(works)).toBe('discog_releases');
    expect(getTableName(workItems)).toBe('discog_recordings');
    expect(getTableName(workItemPlacements)).toBe('discog_release_tracks');
    expect(getTableName(workCredits)).toBe('release_artists');
    expect(getTableName(workItemCredits)).toBe('recording_artists');
  });

  it('keeps the generic handles out of the legacy discog_tracks model', () => {
    // work items resolve to the canonical recording entity, and placements
    // resolve to the release↔recording junction — neither points at the
    // legacy discog_tracks write target.
    expect(workItems).not.toBe(workItemPlacements);
    expect(getTableName(workItems)).not.toBe('discog_tracks');
    expect(getTableName(workItemPlacements)).not.toBe('discog_tracks');
  });
});
