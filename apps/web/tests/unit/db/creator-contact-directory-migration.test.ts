/**
 * Contract for the Contacts directory expand/backfill migration. This guards
 * against accidental loss of legacy contact data while the legacy table stays
 * available for recovery.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_TAG = '0092_fresh_magdalene' as const;
const MIGRATION_PATH = `drizzle/migrations/${MIGRATION_TAG}.sql` as const;
const JOURNAL_PATH = 'drizzle/migrations/meta/_journal.json' as const;

function loadMigrationSql(): string {
  // Vitest for @jovie/web runs with cwd = apps/web.
  return readFileSync(join(process.cwd(), MIGRATION_PATH), 'utf8');
}

describe('creator contact directory migration', () => {
  const sql = loadMigrationSql();

  it('is registered after the current main migration', () => {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), JOURNAL_PATH), 'utf8')
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entry = journal.entries.find(item => item.tag === MIGRATION_TAG);

    expect(entry).toMatchObject({ idx: 92, tag: MIGRATION_TAG });
  });

  it('creates reusable responsibilities and person assignments', () => {
    expect(sql).toContain('CREATE TABLE "creator_contact_people"');
    expect(sql).toContain('CREATE TABLE "creator_contact_responsibilities"');
    expect(sql).toContain('CREATE TABLE "creator_contact_assignments"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_creator_contact_assignments_person_responsibility"'
    );
  });

  it('backfills exact people, deduplicated responsibilities, and assignment history', () => {
    expect(sql).toContain('INSERT INTO "creator_contact_people"');
    expect(sql).toContain(
      'SELECT\n  "id",\n  "creator_profile_id",\n  "person_name"'
    );
    expect(sql).toContain('INSERT INTO "creator_contact_responsibilities"');
    expect(sql).toContain('SELECT DISTINCT ON (');
    expect(sql).toContain('INSERT INTO "creator_contact_assignments"');
    expect(sql).toContain('ROW_NUMBER() OVER (');
    expect(sql).toContain('"started_at"');
    expect(sql).toContain('"ended_at"');
  });

  it('preserves recovery and routes existing correspondence to the exact person', () => {
    expect(sql).toContain('UPDATE "email_threads"');
    expect(sql).toContain(
      'SET "routed_to_contact_person_id" = "routed_to_contact_id"'
    );
    expect(sql).not.toContain('DROP TABLE "creator_contacts"');
    expect(sql).not.toContain('DROP COLUMN "routed_to_contact_id"');
  });
});
