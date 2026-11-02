// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
  doesTableExist: vi.fn(),
}));

import { purgeOrphanRecordings } from './queries';

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  holder.db = drizzle(client);
  // Only the columns read by the production cleanup query are needed here.
  await client.exec(`
    CREATE TABLE discog_recordings (
      id text PRIMARY KEY,
      creator_profile_id text NOT NULL
    );
    CREATE TABLE discog_release_tracks (
      id text PRIMARY KEY,
      recording_id text NOT NULL
    );
    INSERT INTO discog_recordings VALUES
      ('orphan', 'owner'),
      ('shared', 'owner'),
      ('unrequested', 'owner'),
      ('other-owner', 'another-owner');
    INSERT INTO discog_release_tracks VALUES ('remaining-release-track', 'shared');
  `);
});

afterAll(async () => {
  await client?.close();
});

describe('purgeOrphanRecordings', () => {
  it('deletes only requested orphans owned by the profile, preserving shared recordings', async () => {
    expect(
      await purgeOrphanRecordings('owner', ['orphan', 'shared', 'other-owner'])
    ).toBe(1);
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM discog_recordings ORDER BY id'
    );
    expect(rows.map(row => row.id)).toEqual([
      'other-owner',
      'shared',
      'unrequested',
    ]);
  });

  it('does not query or delete anything when no recordings are supplied', async () => {
    const execute = vi.spyOn(client, 'query');
    try {
      expect(await purgeOrphanRecordings('owner', [])).toBe(0);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      execute.mockRestore();
    }
  });
});
