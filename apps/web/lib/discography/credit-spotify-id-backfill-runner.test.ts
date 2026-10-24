import { describe, expect, it, vi } from 'vitest';
import {
  type BackfillDb,
  runCreditSpotifyIdBackfill,
} from './credit-spotify-id-backfill-runner';

const conflictRows = [
  {
    release_artist_id: 'ra-1',
    release_id: 'rel-1',
    artist_id: 'artist-stale',
    artist_name: 'Dimitri Vegas',
    stored_spotify_id: 'stale',
    provider_spotify_id: 'real',
    owner_artist_id: 'artist-real',
    owner_already_credited: false,
    artist_is_unclaimed_auto_created: true,
  },
  {
    release_artist_id: 'ra-2',
    release_id: 'rel-2',
    artist_id: 'artist-auto',
    artist_name: 'Loreen',
    stored_spotify_id: 'old',
    provider_spotify_id: 'new',
    owner_artist_id: null,
    owner_already_credited: false,
    artist_is_unclaimed_auto_created: true,
  },
];

function fakeDb(rows: Record<string, unknown>[]) {
  const writes = vi.fn(async () => ({ rows: [], rowCount: 1 }));
  const db: BackfillDb = {
    execute: vi.fn(async () => ({ rows })),
    transaction: async fn => fn({ execute: writes }),
  };
  return { db, writes };
}

describe('runCreditSpotifyIdBackfill', () => {
  it('dry run reports counts and writes nothing', async () => {
    const { db, writes } = fakeDb(conflictRows);
    const report = await runCreditSpotifyIdBackfill(db, { apply: false });
    expect(report).toEqual({
      mode: 'dry-run',
      conflictingCredits: 2,
      releasesAffected: 2,
      plan: { repoint_credit: 1, set_artist_spotify_id: 1 },
      appliedRows: 0,
    });
    expect(writes).not.toHaveBeenCalled();
  });

  it('apply writes one guarded update per planned repair', async () => {
    const { db, writes } = fakeDb(conflictRows);
    const report = await runCreditSpotifyIdBackfill(db, { apply: true });
    expect(writes).toHaveBeenCalledTimes(2);
    expect(report.appliedRows).toBe(2);
  });

  it('is a no-op once nothing conflicts', async () => {
    const { db, writes } = fakeDb([]);
    const report = await runCreditSpotifyIdBackfill(db, { apply: true });
    expect(report.conflictingCredits).toBe(0);
    expect(writes).not.toHaveBeenCalled();
  });
});
