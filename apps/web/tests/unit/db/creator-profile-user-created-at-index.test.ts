import fs from 'node:fs';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/0102_creator_profiles_user_id_created_at_index.sql'
);
const JOURNAL_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/meta/_journal.json'
);

interface JournalEntry {
  readonly idx: number;
  readonly tag: string;
}

interface Journal {
  readonly entries: JournalEntry[];
}

describe('creator profile user_id + created_at index', () => {
  it('keeps user_id first so dashboard lookups ordered by created_at use the index', () => {
    const index = getTableConfig(creatorProfiles).indexes.find(
      candidate =>
        candidate.config.name === 'idx_creator_profiles_user_id_created_at'
    );

    expect(index).toBeDefined();
    expect(
      index?.config.columns.map(column =>
        'name' in column ? column.name : 'expression'
      )
    ).toEqual(['user_id', 'created_at']);
  });

  it('ships the idempotent restore after 0101', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    const journal = JSON.parse(
      fs.readFileSync(JOURNAL_PATH, 'utf8')
    ) as Journal;
    const currentIndex = journal.entries.findIndex(
      entry => entry.tag === '0102_creator_profiles_user_id_created_at_index'
    );
    expect(currentIndex).toBeGreaterThan(0);
    const previous = journal.entries[currentIndex - 1];
    const current = journal.entries[currentIndex];

    expect(previous).toMatchObject({
      idx: 101,
      tag: '0101_canonical_release_communications',
    });
    expect(current).toMatchObject({
      idx: 102,
      tag: '0102_creator_profiles_user_id_created_at_index',
    });
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_creator_profiles_user_id_created_at"'
    );
    expect(sql).toContain(
      'ON "creator_profiles" USING btree ("user_id", "created_at");'
    );
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
    expect(sql).not.toContain('DROP ');
  });
});
