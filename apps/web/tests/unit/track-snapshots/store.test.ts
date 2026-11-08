// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: vi.fn(),
  setupDbSession: vi.fn(),
}));
vi.mock('@/lib/db/cache', () => ({ cacheQuery: vi.fn() }));
vi.mock('@/lib/db/query-timeout', () => ({
  apiQuery: vi.fn(),
  dashboardQuery: vi.fn(),
}));

import { runTrackDailySnapshots } from '@/lib/track-snapshots/run';
import { drizzleTrackSnapshotStore as store } from '@/lib/track-snapshots/store';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let client: PGlite;
beforeAll(async () => {
  client = new PGlite();
  holder.db = drizzle(client);
  // Only disposable fixtures; the new production migration executes unchanged.
  await client.exec(`
    CREATE TABLE creator_profiles (id uuid PRIMARY KEY, username_normalized text);
    CREATE TABLE discog_releases (id uuid PRIMARY KEY, creator_profile_id uuid, deleted_at timestamp);
    CREATE TABLE discog_recordings (id uuid PRIMARY KEY, creator_profile_id uuid, metadata jsonb);
    CREATE TABLE discog_release_tracks (id uuid PRIMARY KEY, release_id uuid, recording_id uuid, slug text, metadata jsonb);
    CREATE TABLE discog_tracks (id uuid PRIMARY KEY, release_id uuid, slug text, metadata jsonb);
    CREATE TABLE provider_links (id uuid PRIMARY KEY, provider_id text, release_id uuid, track_id uuid, release_track_id uuid, url text);
    CREATE TABLE click_events (creator_profile_id uuid, metadata jsonb, created_at timestamp, is_bot boolean);
  `);
  const dir = path.join(process.cwd(), 'drizzle/migrations');
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')
  ) as { entries: { tag: string }[] };
  const migration = journal.entries.find(row =>
    row.tag.endsWith('_track_daily_snapshots')
  );
  expect(migration).toBeDefined();
  await client.exec(
    readFileSync(path.join(dir, `${migration?.tag}.sql`), 'utf8').replaceAll(
      '--> statement-breakpoint',
      ''
    )
  );
  await client.exec(`
    INSERT INTO creator_profiles VALUES ('${id(1)}', 'fixture'), ('${id(2)}', 'other-fixture');
    INSERT INTO discog_releases VALUES ('${id(3)}', '${id(1)}', NULL), ('${id(4)}', '${id(2)}', NULL), ('${id(5)}', '${id(1)}', NOW());
    INSERT INTO discog_recordings VALUES ('${id(6)}', '${id(1)}', '{"spotifyId":"recording-id"}'), ('${id(7)}', '${id(2)}', '{"spotifyId":"other-id"}');
    INSERT INTO discog_release_tracks VALUES
      ('${id(8)}', '${id(3)}', '${id(6)}', 'track', '{"spotifyId":"appearance-id"}'),
      ('${id(9)}', '${id(3)}', '${id(6)}', 'fallback', '{}'),
      ('${id(10)}', '${id(4)}', '${id(7)}', 'other', '{}'),
      ('${id(11)}', '${id(5)}', '${id(6)}', 'archived', '{}');
    INSERT INTO provider_links VALUES
      ('${id(12)}', 'youtube', NULL, NULL, '${id(8)}', 'https://youtu.be/aaaaaaaaaaa'),
      ('${id(13)}', 'youtube_music', '${id(3)}', NULL, NULL, 'https://youtube.com/watch?v=bbbbbbbbbbb'),
      ('${id(14)}', 'youtube', NULL, NULL, '${id(10)}', 'https://youtu.be/ccccccccccc'),
      ('${id(15)}', 'youtube', NULL, NULL, '${id(11)}', 'https://youtu.be/ddddddddddd');
    INSERT INTO click_events VALUES
      ('${id(1)}', '{"contentType":"release","contentId":"${id(3)}"}', '2026-11-01 23:59:59', false),
      ('${id(1)}', '{"contentType":"release","contentId":"${id(3)}"}', '2026-11-02 00:00:00', false),
      ('${id(1)}', '{"contentType":"release","contentId":"${id(3)}"}', '2026-11-01 12:00:00', true),
      ('${id(2)}', '{"contentType":"release","contentId":"${id(4)}"}', '2026-11-01 12:00:00', false);
  `);
}, 30_000);
afterAll(async () => client?.close());

describe('track snapshot database contract', () => {
  it('loads canonical imports without legacy rows, scopes links and persists idempotently', async () => {
    expect(await store.listProfileIds([])).toEqual([]);
    expect(await store.listProfileIds(['fixture'])).toEqual([id(1)]);
    expect(await store.loadCatalog(id(99))).toEqual({
      creatorProfileId: id(99),
      releaseIds: [],
      tracks: [],
      videos: [],
    });
    const catalog = await store.loadCatalog(id(1));
    expect(catalog.releaseIds).toEqual([id(3)]);
    expect(catalog.tracks).toEqual(
      expect.arrayContaining([
        { releaseId: id(3), trackId: id(8), spotifyTrackId: 'appearance-id' },
        { releaseId: id(3), trackId: id(9), spotifyTrackId: 'recording-id' },
      ])
    );
    expect(catalog.tracks).toHaveLength(2);
    expect(catalog.videos).toEqual(
      expect.arrayContaining([
        { releaseId: id(3), trackId: id(8), videoId: 'aaaaaaaaaaa' },
        { releaseId: id(3), trackId: null, videoId: 'bbbbbbbbbbb' },
      ])
    );
    expect(catalog.videos).toHaveLength(2);
    expect(await store.releaseClicks(id(1), '2026-11-01')).toEqual(
      new Map([[id(3), { total: 2, priorDay: 1 }]])
    );
    const input = {
      now: new Date('2026-11-02T09:25:00Z'),
      usernames: ['fixture'],
      store,
      fetchers: {
        spotifyPopularity: vi.fn(
          async () =>
            new Map([
              ['appearance-id', 17],
              ['recording-id', 23],
            ])
        ),
        youtubeViews: vi.fn(
          async () =>
            new Map([
              ['aaaaaaaaaaa', 50],
              ['bbbbbbbbbbb', 80],
            ])
        ),
      },
    };
    expect(await runTrackDailySnapshots(input)).toMatchObject({
      rowsInserted: 5,
      failures: [],
    });
    expect(await runTrackDailySnapshots(input)).toMatchObject({
      rowsInserted: 0,
      failures: [],
    });
    expect(
      await runTrackDailySnapshots({
        ...input,
        now: new Date('2026-11-03T09:25:00Z'),
      })
    ).toMatchObject({ rowsInserted: 5, failures: [] });
    // The same source/day on another release-track identity stays distinct.
    const result = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM track_daily_snapshots'
    );
    expect(result.rows[0].count).toBe(10);
    await expect(
      client.exec(
        `INSERT INTO track_daily_snapshots (creator_profile_id, release_id, track_id, source, snapshot_day, fetched_at, values) VALUES ('${id(1)}','${id(3)}','${id(99)}','spotify_popularity','2026-11-04',now(),'{}')`
      )
    ).rejects.toThrow();
    await expect(
      client.exec(
        `INSERT INTO track_daily_snapshots (creator_profile_id, release_id, source, snapshot_day, fetched_at, values) VALUES ('${id(1)}','${id(3)}','invalid','2026-11-04',now(),'{}')`
      )
    ).rejects.toThrow();
  });
  it('maps legacy video links to the canonical release-track identity', async () => {
    await client.exec(`INSERT INTO discog_tracks VALUES ('${id(16)}', '${id(3)}', 'fallback', '{}');
      INSERT INTO provider_links VALUES ('${id(17)}', 'youtube', NULL, '${id(16)}', NULL, 'https://youtu.be/eeeeeeeeeee');`);
    expect((await store.loadCatalog(id(1))).videos).toContainEqual({
      releaseId: id(3),
      trackId: id(9),
      videoId: 'eeeeeeeeeee',
    });
  });
});
