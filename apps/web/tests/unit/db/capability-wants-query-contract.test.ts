import type { SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { capabilityWants } from '@/lib/db/schema/waitlist';
import { matchWinbackCandidates } from '@/lib/waitlist/winback.server';

describe('capability-want query contract', () => {
  it('declares the nullable resolution timestamp used by the winback reader', async () => {
    const queries: string[] = [];
    const dialect = new PgDialect();
    const tx = {
      execute: vi.fn(async (statement: SQL) => {
        const query = dialect.sqlToQuery(statement).sql;
        queries.push(query);
        return {
          rows: query.includes('to_regclass')
            ? [{ regclass: 'capability_wants' }]
            : [],
        };
      }),
    } as unknown as DbOrTransaction;

    await matchWinbackCandidates(tx, 'release_pages', {
      now: new Date('2026-11-09T00:00:00.000Z'),
    });

    const reader = queries.find(query => query.includes('resolved_at'));
    expect(reader).toMatch(/resolved_at IS NULL/);
    const resolution = getTableConfig(capabilityWants).columns.find(
      column => column.name === 'resolved_at'
    );
    expect(resolution?.getSQLType()).toBe('timestamp with time zone');
    expect(resolution?.notNull).toBe(false);
  });
});
