import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  queries: [] as unknown[],
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      state.queries.push(query);
      return { rows: state.rows };
    }),
  },
}));
const {
  hasProductionQuery,
  measureProductionStat: measure,
  productionQueryRefs,
} = await import('./queries.server');
const { listProofStats } = await import('./registry');
const dialect = new PgDialect();
const sqlText = (query: unknown) => dialect.sqlToQuery(query as SQL).sql;
describe('production proof-stat queries', () => {
  beforeEach(() => {
    state.rows = [];
    state.queries = [];
  });
  it('has a query for every production stat in the registry', () => {
    const production = listProofStats().filter(
      stat => stat.source.kind === 'production'
    );
    for (const stat of production) {
      expect(hasProductionQuery(stat.source.ref), stat.id).toBe(true);
    }
    expect(productionQueryRefs()).toHaveLength(production.length);
    expect(hasProductionQuery('nope')).toBe(false);
  });
  it('excludes internal, test and synthetic accounts in every count', async () => {
    state.rows = [{ value: '12' }];
    for (const ref of productionQueryRefs()) {
      await measure(ref);
    }
    const [accounts, artists, links, alerts] = state.queries.map(sqlText);
    expect(accounts).toMatch(/deleted_at is null/u);
    expect(accounts).toMatch(/account_class is null/u);
    expect(accounts).toMatch(/!~\*/u);
    for (const text of [artists, links, alerts]) {
      expect(text).toMatch(/not exists/u);
      expect(text).toMatch(/internal_u\.account_class is not null/u);
    }
    expect(artists).toMatch(/is_claimed = true/u);
    expect(artists).toMatch(/username_normalized not in/u);
    expect(links).toMatch(
      /distinct s\.creator_profile_id, s\.smart_link_slug/u
    );
    expect(alerts).toMatch(/n\.status = 'sent'/u);
  });
  it('returns the count as a number', async () => {
    state.rows = [{ value: '104211' }];
    await expect(measure('accounts_total')).resolves.toBe(104_211);
  });
  it('throws on an unknown ref or a missing or negative count', async () => {
    await expect(measure('nope')).rejects.toThrow(/No production query/u);
    state.rows = [];
    await expect(measure('accounts_total')).rejects.toThrow(/no count/u);
    state.rows = [{ value: -1 }];
    await expect(measure('accounts_total')).rejects.toThrow(/no count/u);
  });
});
