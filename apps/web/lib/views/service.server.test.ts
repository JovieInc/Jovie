import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; set: Record<string, unknown> }[],
  txSelect: [] as unknown[][],
  dbSelect: [] as unknown[][],
  atomicOptions: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/constants/domains', () => ({ BASE_URL: 'https://jov.ie' }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => hoisted.dbSelect.shift() ?? [] }),
      }),
    }),
  },
}));
vi.mock('@/lib/db/legacy-transaction', async () => {
  const { getTableName } = await import('drizzle-orm');
  return {
    runAtomicDbOperation: async (
      fn: (tx: unknown) => unknown,
      options: unknown
    ) => {
      hoisted.atomicOptions.push(options);
      const tx = {
        insert: (t: unknown) => ({
          values: (values: Record<string, unknown>) => {
            hoisted.inserts.push({
              table: getTableName(t as never),
              values,
            });
            const p = Promise.resolve();
            return Object.assign(p, {
              returning: async () => [{ id: 'view-1' }],
            });
          },
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => hoisted.txSelect.shift() ?? [],
            }),
          }),
        }),
        update: (t: unknown) => ({
          set: (set: Record<string, unknown>) => ({
            where: async () => {
              hoisted.updates.push({ table: getTableName(t as never), set });
            },
          }),
        }),
      };
      return fn(tx);
    },
  };
});

import { getSharedView, publishView } from './service.server';

const spec = {
  schema: 'jovie.view.v1',
  title: 'Weekly',
  blocks: [{ type: 'stat', label: 'Streams', value: '10' }],
};

beforeEach(() => {
  hoisted.inserts.length = 0;
  hoisted.updates.length = 0;
  hoisted.txSelect.length = 0;
  hoisted.dbSelect.length = 0;
  hoisted.atomicOptions.length = 0;
});

describe('publishView', () => {
  it('creates a view and version 1 with a 32-hex token', async () => {
    const result = await publishView({
      ownerUserId: 'user-1',
      spec,
      createdBy: 'agent-x',
    });
    expect(result.id).toBe('view-1');
    expect(result.version).toBe(1);
    expect(result.token).toMatch(/^[0-9a-f]{32}$/);
    expect(result.url).toBe(`https://jov.ie/v/${result.token}`);
    expect(hoisted.inserts.map(i => i.table)).toEqual([
      'dashboard_views',
      'dashboard_view_versions',
    ]);
    expect(hoisted.atomicOptions[0]).toMatchObject({ actorId: 'user-1' });
  });

  it('bumps the version on update and keeps the token', async () => {
    hoisted.txSelect.push([{ version: 2, shareToken: 'a'.repeat(32) }]);
    const result = await publishView({
      ownerUserId: 'user-1',
      viewId: 'view-1',
      spec,
      createdBy: 'agent-x',
    });
    expect(result).toMatchObject({ version: 3, token: 'a'.repeat(32) });
    expect(hoisted.updates[0]?.set).toMatchObject({ version: 3 });
    expect(hoisted.inserts[0]?.values).toMatchObject({ version: 3 });
  });

  it('rejects an update to a view the owner does not hold', async () => {
    await expect(
      publishView({
        ownerUserId: 'user-1',
        viewId: 'view-9',
        spec,
        createdBy: 'a',
      })
    ).rejects.toMatchObject({ code: 'view_not_found' });
  });

  it('rejects invalid and oversized specs before touching the db', async () => {
    await expect(
      publishView({ ownerUserId: 'u', spec: { nope: 1 }, createdBy: 'a' })
    ).rejects.toMatchObject({ code: 'invalid_spec' });
    const big = {
      ...spec,
      blocks: Array.from({ length: 40 }, () => ({
        type: 'html',
        html: 'x'.repeat(100_000),
      })),
    };
    await expect(
      publishView({ ownerUserId: 'u', spec: big, createdBy: 'a' })
    ).rejects.toMatchObject({ code: 'spec_too_large' });
    expect(hoisted.atomicOptions).toHaveLength(0);
  });
});

describe('getSharedView', () => {
  it('returns null for malformed tokens without querying', async () => {
    hoisted.dbSelect.push([{ id: 'x' }]);
    expect(await getSharedView('nope')).toBeNull();
    expect(hoisted.dbSelect).toHaveLength(1);
  });

  it('returns null when missing or revoked', async () => {
    expect(await getSharedView('b'.repeat(32))).toBeNull();
  });

  it('returns the validated view', async () => {
    const updatedAt = new Date();
    hoisted.dbSelect.push([
      {
        id: 'v',
        title: 'Weekly',
        spec,
        version: 1,
        updatedAt,
        ownerUserId: 'u',
      },
    ]);
    const view = await getSharedView('c'.repeat(32));
    expect(view).toMatchObject({ id: 'v', version: 1, ownerUserId: 'u' });
  });
});
