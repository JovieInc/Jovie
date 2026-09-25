import fs from 'node:fs';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/0107_deduped_funnel_events.sql'
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

/**
 * JOV-6459 — server_analytics_events.dedupe_key: the idempotency constraint
 * that makes activation/payment deliveries safe across refreshes, multiple
 * tabs, multiple devices and webhook redeliveries.
 */
describe('server analytics dedupe migration', () => {
  it('exposes a nullable dedupe_key column with a unique index on the table config', () => {
    const column = getTableConfig(serverAnalyticsEvents).columns.find(
      candidate => candidate.name === 'dedupe_key'
    );
    expect(column).toBeDefined();
    expect(column?.columnType).toBe('PgText');

    const index = getTableConfig(serverAnalyticsEvents).indexes.find(
      candidate =>
        candidate.config.name === 'server_analytics_events_dedupe_key_unique'
    );
    expect(index).toBeDefined();
    expect(index?.config.unique).toBe(true);
    expect(
      index?.config.columns.map(column =>
        'name' in column ? column.name : 'expression'
      )
    ).toEqual(['dedupe_key']);
  });

  it('ships the column and idempotent unique index in one migration after 0106', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    const journal = JSON.parse(
      fs.readFileSync(JOURNAL_PATH, 'utf8')
    ) as Journal;
    const currentIndex = journal.entries.findIndex(
      entry => entry.tag === '0107_deduped_funnel_events'
    );
    expect(currentIndex).toBeGreaterThan(0);
    const previous = journal.entries[currentIndex - 1];
    const current = journal.entries[currentIndex];

    expect(previous).toMatchObject({
      idx: 106,
      tag: '0106_premium_bruce_banner',
    });
    expect(current).toMatchObject({
      idx: 107,
      tag: '0107_deduped_funnel_events',
    });
    expect(sql).toContain(
      'ALTER TABLE "server_analytics_events" ADD COLUMN "dedupe_key" text;'
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "server_analytics_events_dedupe_key_unique" ON "server_analytics_events" USING btree ("dedupe_key");'
    );
    expect(sql).not.toContain('DROP ');
  });
});
