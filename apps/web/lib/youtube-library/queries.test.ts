import { spawnSync } from 'node:child_process';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listChannelVideoLedgerForProfile,
  listVideosForProfile,
} from './queries';

const { where, select } = vi.hoisted(() => ({
  where: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { select } }));

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    from: () => query,
    leftJoin: () => query,
    where: (condition: unknown) => {
      where(condition);
      return query;
    },
    orderBy: () => query,
    limit: async () => [],
    then: (resolve: (rows: unknown[]) => void) => resolve([]),
  };
  select.mockReturnValue(query);
});

/** Exercise the real Drizzle predicate over mixed-visibility imported rows.
 * Equality/AND and NULL semantics here are shared by PostgreSQL and SQLite.
 * A child process keeps node:sqlite outside Vite's module bundler.
 */
function visibleIds(): string[] {
  const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
       import { readFileSync } from 'node:fs';
       const { sql, params } = JSON.parse(readFileSync(0, 'utf8'));
       const db = new DatabaseSync(':memory:');
       db.exec('CREATE TABLE youtube_videos (id TEXT, creator_profile_id TEXT, channel_id TEXT, privacy_status TEXT)');
       const insert = db.prepare('INSERT INTO youtube_videos VALUES (?, ?, ?, ?)');
       for (const visibility of ['public', 'private', 'unlisted', null, 'unknown']) {
         insert.run(String(visibility), 'owner', 'channel', visibility);
       }
       insert.run('other-owner', 'other', 'channel', 'public');
       insert.run('other-channel', 'owner', 'other', 'private');
       const bindings = Object.fromEntries(params.map((value, index) => ['$' + (index + 1), value]));
       const rows = db.prepare('SELECT id FROM youtube_videos WHERE ' + sql + ' ORDER BY id').all(bindings);
       console.log(JSON.stringify(rows.map(row => row.id)));
       db.close();`,
    ],
    { input: JSON.stringify(predicate), encoding: 'utf8', timeout: 5000 }
  );
  expect(probe.status, probe.stderr).toBe(0);
  return JSON.parse(probe.stdout) as string[];
}

describe('YouTube inventory visibility', () => {
  it('public MCP inventory excludes private, unlisted, unknown and other-owner uploads', async () => {
    await listVideosForProfile({ creatorProfileId: 'owner' });
    expect(visibleIds()).toEqual(['public']);
  });

  it('the authenticated owner ledger retains all visibilities for its exact channel', async () => {
    await listChannelVideoLedgerForProfile({
      creatorProfileId: 'owner',
      channelId: 'channel',
    });
    expect(visibleIds()).toEqual([
      'null',
      'private',
      'public',
      'unknown',
      'unlisted',
    ]);
  });
});
