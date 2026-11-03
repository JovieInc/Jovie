import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Store contract with a fake query builder: fallbacks never throw, publish
 * writes pointer + audit row in one atomic operation and then expires the
 * record's cache tag and live paths.
 */

const state = vi.hoisted(() => ({
  tableExists: true,
  selectResults: [] as unknown[][],
  inserts: [] as { values: unknown; conflict?: unknown }[],
  atomicCalls: [] as unknown[],
  revalidatedTags: [] as unknown[][],
  revalidatedPaths: [] as string[],
  readThrows: false,
}));

function chain(result: () => unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
    builder[method] = () => builder;
  }
  // biome-friendly thenable so `await db.select()...` resolves.
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject: (e: unknown) => unknown
  ) => {
    try {
      if (state.readThrows) throw new Error('db down');
      return Promise.resolve(result()).then(resolve, reject);
    } catch (error) {
      return Promise.reject(error).then(resolve, reject);
    }
  };
  return builder;
}

const fakeDb = {
  select: () => chain(() => state.selectResults.shift() ?? []),
  insert: () => ({
    values: (values: unknown) => {
      const entry: { values: unknown; conflict?: unknown } = { values };
      state.inserts.push(entry);
      const result = Promise.resolve(undefined) as Promise<undefined> & {
        onConflictDoUpdate: (conflict: unknown) => Promise<undefined>;
        returning: () => Promise<unknown[]>;
      };
      result.onConflictDoUpdate = conflict => {
        entry.conflict = conflict;
        return Promise.resolve(undefined);
      };
      result.returning = () =>
        Promise.resolve([
          {
            ...(values as object),
            id: 'new-version',
            createdAt: new Date('2026-10-28T00:00:00Z'),
          },
        ]);
      return result;
    },
  }),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: fakeDb,
  doesTableExist: vi.fn(async () => state.tableExists),
}));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: vi.fn(
    async (operation: (tx: unknown) => Promise<unknown>, options: unknown) => {
      state.atomicCalls.push(options);
      return operation(fakeDb);
    }
  ),
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: (...args: unknown[]) => state.revalidatedTags.push(args),
  revalidatePath: (path: string) => state.revalidatedPaths.push(path),
}));

const { MARKETING_PAGE_KIND, DEFAULT_HOME_SPEC } = await import(
  './marketing-page'
);
const store = await import('./store.server');

function validSpec() {
  const spec = structuredClone(DEFAULT_HOME_SPEC);
  const hero = spec.sections[0];
  if (hero?.section === 'hero') hero.copy.subhead = 'A free profile for you.';
  return spec;
}

describe('content record store', () => {
  beforeEach(() => {
    state.tableExists = true;
    state.selectResults = [];
    state.inserts = [];
    state.atomicCalls = [];
    state.revalidatedTags = [];
    state.revalidatedPaths = [];
    state.readThrows = false;
  });

  it('serves the code default before the migration lands', async () => {
    state.tableExists = false;
    const live = await store.getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(live).toMatchObject({ source: 'default', versionId: null });
    expect(live.data).toBe(DEFAULT_HOME_SPEC);
  });

  it('serves the code default when the store errors or nothing is live', async () => {
    state.readThrows = true;
    expect(
      (await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).source
    ).toBe('default');
    state.readThrows = false;
    state.selectResults = [[]];
    expect(
      (await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).source
    ).toBe('default');
  });

  it('serves the published version, but not one that no longer validates', async () => {
    const publishedAt = new Date('2026-10-28T01:00:00Z');
    state.selectResults = [
      [{ versionId: 'v2', version: 2, data: validSpec(), publishedAt }],
    ];
    expect(await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).toEqual({
      data: validSpec(),
      source: 'live',
      versionId: 'v2',
      version: 2,
      publishedAt: publishedAt.toISOString(),
    });

    state.selectResults = [
      [{ versionId: 'v3', version: 3, data: { sections: [] }, publishedAt }],
    ];
    expect(
      (await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).source
    ).toBe('default');
  });

  it('refuses to store an invalid draft', async () => {
    await expect(
      store.createContentVersion(MARKETING_PAGE_KIND, {
        key: 'home',
        data: DEFAULT_HOME_SPEC,
        author: 'agent:summer',
      })
    ).rejects.toBeInstanceOf(store.ContentValidationError);
    expect(state.inserts).toEqual([]);
  });

  it('numbers drafts after the latest version', async () => {
    state.selectResults = [[{ latest: 4 }]];
    const version = await store.createContentVersion(MARKETING_PAGE_KIND, {
      key: 'home',
      data: validSpec(),
      author: 'agent:summer',
      note: 'n',
    });
    expect(version.version).toBe(5);
    expect(state.atomicCalls).toEqual([
      expect.objectContaining({ actorId: 'agent:summer' }),
    ]);
  });

  it('publishes atomically with an audit row, then expires the live caches', async () => {
    const createdAt = new Date();
    state.selectResults = [
      // getContentVersion(target)
      [
        {
          id: 'v5',
          kind: 'marketing-page',
          recordKey: 'home',
          version: 5,
          schemaVersion: 1,
          data: validSpec(),
          author: 'agent:summer',
          note: null,
          createdAt,
        },
      ],
      // current live pointer inside the atomic op
      [{ versionId: 'v4' }],
    ];
    const move = await store.publishContentVersion(MARKETING_PAGE_KIND, {
      key: 'home',
      versionId: 'v5',
      actor: 'agent:summer',
      reason: 'subhead',
    });
    expect(move).toMatchObject({
      action: 'publish',
      fromVersionId: 'v4',
      toVersionId: 'v5',
      toVersion: 5,
    });
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]?.conflict).toBeDefined();
    expect(state.inserts[1]?.values).toMatchObject({
      action: 'publish',
      fromVersionId: 'v4',
      toVersionId: 'v5',
      actor: 'agent:summer',
      reason: 'subhead',
    });
    expect(state.revalidatedTags).toEqual([
      ['content-record:marketing-page:home', { expire: 0 }],
    ]);
    expect(state.revalidatedPaths).toEqual(['/']);
  });

  it('rejects publishing a version of another record', async () => {
    state.selectResults = [
      [
        {
          id: 'x',
          kind: 'marketing-page',
          recordKey: 'pricing',
          version: 1,
          schemaVersion: 1,
          data: validSpec(),
          author: 'a',
          note: null,
          createdAt: new Date(),
        },
      ],
    ];
    await expect(
      store.publishContentVersion(MARKETING_PAGE_KIND, {
        key: 'home',
        versionId: 'x',
        actor: 'agent:summer',
      })
    ).rejects.toBeInstanceOf(store.ContentConflictError);
    expect(state.revalidatedTags).toEqual([]);
  });

  it('rolls back to the version that was live before the last move', async () => {
    state.selectResults = [
      [{ fromVersionId: 'v4' }],
      [
        {
          id: 'v4',
          kind: 'marketing-page',
          recordKey: 'home',
          version: 4,
          schemaVersion: 1,
          data: validSpec(),
          author: 'a',
          note: null,
          createdAt: new Date(),
        },
      ],
      [{ versionId: 'v5' }],
    ];
    const move = await store.rollbackContent(MARKETING_PAGE_KIND, {
      key: 'home',
      actor: 'user:tim',
      reason: 'revert',
    });
    expect(move).toMatchObject({
      action: 'rollback',
      fromVersionId: 'v5',
      toVersionId: 'v4',
    });
  });

  it('refuses a rollback with no earlier version', async () => {
    state.selectResults = [[]];
    await expect(
      store.rollbackContent(MARKETING_PAGE_KIND, {
        key: 'home',
        actor: 'user:tim',
      })
    ).rejects.toBeInstanceOf(store.ContentConflictError);
  });
});
