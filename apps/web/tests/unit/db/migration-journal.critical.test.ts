/**
 * Migration journal ordering guard.
 *
 * Ensures the Drizzle migration journal stays consistent:
 * - Monotonically increasing timestamps
 * - Sequential idx values with no gaps
 * - No duplicate indexes
 *
 * Marked .critical so it runs on every feature branch push.
 *
 * @see apps/web/drizzle/migrations/meta/_journal.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const JOURNAL_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/meta/_journal.json'
);

function loadJournal(): Journal {
  const raw = fs.readFileSync(JOURNAL_PATH, 'utf-8');
  return JSON.parse(raw) as Journal;
}

describe('migration journal ordering', () => {
  const journal = loadJournal();

  it('has at least one migration entry', () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it('has monotonically increasing timestamps', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1];
      const curr = journal.entries[i];
      expect(curr.when).toBeGreaterThanOrEqual(prev.when);
    }
  });

  it('has sequential idx values with no gaps', () => {
    for (let i = 0; i < journal.entries.length; i++) {
      expect(journal.entries[i].idx).toBe(i);
    }
  });

  it('has no duplicate idx values', () => {
    const indexes = journal.entries.map(e => e.idx);
    const unique = new Set(indexes);
    expect(unique.size).toBe(indexes.length);
  });

  it('has no duplicate tags', () => {
    const tags = journal.entries.map(e => e.tag);
    const unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
  });
});
