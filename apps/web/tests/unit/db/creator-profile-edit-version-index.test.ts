import fs from 'node:fs';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/0083_first_molly_hayes.sql'
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

describe('creator profile edit-version index', () => {
  it('keeps user_id first so profile compare-and-swap lookups use the index', () => {
    const index = getTableConfig(creatorProfiles).indexes.find(
      candidate =>
        candidate.config.name === 'idx_creator_profiles_user_edit_version'
    );

    expect(index).toBeDefined();
    expect(
      index?.config.columns.map(column =>
        'name' in column ? column.name : 'expression'
      )
    ).toEqual(['user_id', 'profile_edit_version']);
  });

  it('ships the column and idempotent index in one migration after 0082', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    const journal = JSON.parse(
      fs.readFileSync(JOURNAL_PATH, 'utf8')
    ) as Journal;
    const currentIndex = journal.entries.findIndex(
      entry => entry.tag === '0083_first_molly_hayes'
    );
    expect(currentIndex).toBeGreaterThan(0);
    const previous = journal.entries[currentIndex - 1];
    const current = journal.entries[currentIndex];

    expect(previous).toMatchObject({
      idx: 82,
      tag: '0082_real_peter_parker',
    });
    expect(current).toMatchObject({ idx: 83, tag: '0083_first_molly_hayes' });
    expect(sql).toContain(
      'ALTER TABLE "creator_profiles" ADD COLUMN "profile_edit_version" integer DEFAULT 1 NOT NULL;'
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_creator_profiles_user_edit_version" ON "creator_profiles" USING btree ("user_id","profile_edit_version");'
    );
    expect(sql).not.toContain('DROP ');
  });
});
