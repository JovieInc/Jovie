import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  excluded: new Set<string>(),
  predicates: [] as unknown[],
  rows: [
    { id: 'fixture', username: 'browse-ready-user', createdAt: null },
    { id: 'artist', username: 'real-artist', createdAt: null },
    { id: 'artist2', username: 'second-artist', createdAt: null },
  ],
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin/customer-population', () => ({
  getCustomerPopulationExclusions: async () => ({ profileIds: state.excluded }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/db/schema/profiles', () => ({ creatorProfiles: {} }));
vi.mock('@/lib/db/schema/links', () => ({ socialLinks: {} }));
// A small query adapter exercises exclusion before count/limit/offset; it
// does not claim to certify Postgres, RLS or the deployed database.
vi.mock('drizzle-orm', () => ({
  and:
    (...parts: Array<((row: { id: string }) => boolean) | undefined>) =>
    (row: { id: string }) =>
      parts.every(part => !part || part(row)),
  notInArray: (_column: unknown, ids: string[]) => (row: { id: string }) =>
    !ids.includes(row.id),
  count: () => 'count',
  desc: vi.fn(),
  sql: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
  or: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: (fields: Record<string, unknown>) => ({
      from: () => {
        let predicate: ((row: { id: string }) => boolean) | undefined;
        let limit = Infinity;
        let offset = 0;
        const chain = {
          where: (value: typeof predicate) => {
            predicate = value;
            state.predicates.push(value);
            return chain;
          },
          orderBy: () => chain,
          groupBy: () => chain,
          limit: (value: number) => {
            limit = value;
            return chain;
          },
          offset: (value: number) => {
            offset = value;
            return chain;
          },
          then: (resolve: (rows: unknown[]) => unknown) => {
            const eligible = state.rows.filter(
              row => !predicate || predicate(row)
            );
            return resolve(
              fields.value === 'count'
                ? [{ value: eligible.length }]
                : 'username' in fields
                  ? eligible.slice(offset, offset + limit)
                  : []
            );
          },
        };
        return chain;
      },
    }),
  },
}));

import { getAdminCreatorProfiles } from '@/lib/admin/creator-profiles';

beforeEach(() => {
  state.predicates.length = 0;
  state.excluded = new Set(['fixture']);
});

describe('Creators customer population', () => {
  it('uses one exclusion predicate for count and pages without leaving fixture holes', async () => {
    const first = await getAdminCreatorProfiles({ pageSize: 1 });
    const second = await getAdminCreatorProfiles({ pageSize: 1, page: 2 });
    expect([first.total, second.total]).toEqual([2, 2]);
    expect(first.profiles.map(row => row.id)).toEqual(['artist']);
    expect(second.profiles.map(row => row.id)).toEqual(['artist2']);
    expect(state.predicates[0]).toBe(state.predicates[1]);
  });

  it('preserves the population when no explicit fixture provenance exists', async () => {
    state.excluded.clear();
    const result = await getAdminCreatorProfiles();
    expect(result.total).toBe(3);
    expect(result.profiles.map(row => row.id)).toEqual([
      'fixture',
      'artist',
      'artist2',
    ]);
  });
});
