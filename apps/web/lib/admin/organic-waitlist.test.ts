import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { organicWaitlistEntrySql } from './organic-waitlist';

describe('organic waitlist predicate', () => {
  it('excludes rows whose linked user is more than a day older than the row', () => {
    const { sql: text } = new PgDialect().sqlToQuery(organicWaitlistEntrySql());
    expect(text).toContain('NOT EXISTS');
    expect(text).toContain(
      '"users"."waitlist_entry_id" = "waitlist_entries"."id"'
    );
    expect(text).toContain(
      '"users"."created_at" < "waitlist_entries"."created_at" - interval \'1 day\''
    );
  });
});
