import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));

const hoisted = vi.hoisted(() => ({
  wheres: [] as unknown[],
  executes: [] as unknown[],
}));

interface QueryDouble extends Promise<unknown[]> {
  from: () => QueryDouble;
  innerJoin: () => QueryDouble;
  where: (clause: unknown) => QueryDouble;
}

function chain(result: unknown[]): QueryDouble {
  const node: QueryDouble = Object.assign(Promise.resolve(result), {
    from: () => node,
    innerJoin: () => node,
    where: (clause: unknown) => {
      hoisted.wheres.push(clause);
      return node;
    },
  });
  return node;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => chain([{ value: 'Label', count: 3 }]),
    execute: (query: unknown) => {
      hoisted.executes.push(query);
      return Promise.resolve({
        rows: [{ count: 2, email_count: 1, phone_count: 1 }],
      });
    },
  },
}));

const { getAdminPlatformStats } = await import('./platform-stats');
const dialect = new PgDialect();

describe('getAdminPlatformStats', () => {
  it('scopes every profile-based aggregate to customer-owned profiles', async () => {
    const stats = await getAdminPlatformStats();

    expect(stats.contactsCaptured).toBe(2);
    expect(stats.totalUniqueVisitors).toBe(2);

    const sqlTexts = [...hoisted.wheres, ...hoisted.executes].map(
      query => dialect.sqlToQuery(query as never).sql
    );
    // clicks, claimed creators, releases, tracks, labels, distributors,
    // audience members and contact subscriptions
    const scoped = sqlTexts.filter(text => text.includes('internal_cp'));
    expect(scoped.length).toBeGreaterThanOrEqual(8);
  });
});
