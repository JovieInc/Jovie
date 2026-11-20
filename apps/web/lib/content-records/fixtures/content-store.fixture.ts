import { vi } from 'vitest';

/**
 * Store contract with a fake query builder: fallbacks never throw, publish
 * writes pointer + audit row in one atomic operation and then expires the
 * record's cache tag and live paths.
 */

export const state = {
  tableExists: true,
  selectResults: [] as unknown[][],
  inserts: [] as { values: unknown; conflict?: unknown }[],
  atomicCalls: [] as unknown[],
  revalidatedTags: [] as unknown[][],
  revalidatedPaths: [] as string[],
  readThrows: false,
  updateResults: [{ versionId: 'changed' }] as unknown[],
  updates: [] as unknown[],
  cacheThrows: false,
  initialPointerConflict: false,
  atomicFailure: 'none' as 'none' | 'before' | 'after',
};

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
        onConflictDoNothing: () => typeof result;
        returning: () => Promise<unknown[]>;
      };
      result.onConflictDoUpdate = conflict => {
        entry.conflict = conflict;
        return Promise.resolve(undefined);
      };
      result.onConflictDoNothing = () => result;
      result.returning = () =>
        Promise.resolve(
          [
            {
              ...(values as object),
              id: (values as { id?: string }).id ?? 'new-version',
              createdAt: new Date('2026-10-28T00:00:00Z'),
            },
          ].filter(
            () =>
              !(
                state.initialPointerConflict &&
                'versionId' in (values as object)
              )
          )
        );
      return result;
    },
  }),
  update: () => ({
    set: (values: unknown) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          state.updates.push({ values, condition });
          return state.updateResults;
        },
      }),
    }),
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
      if (state.atomicFailure === 'before')
        throw new Error('transport outcome unavailable');
      const result = await operation(fakeDb);
      if (state.atomicFailure === 'after')
        throw new Error('commit acknowledgement lost');
      return result;
    }
  ),
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@/lib/observability/build-info', () => ({
  getDeployedBuildInfo: async () => ({
    commitSha: 'a'.repeat(40),
    buildId: 'build-a',
  }),
}));
vi.mock('../access.server', () => ({
  resolveContentApprover: vi.fn(async () => ({
    ok: true,
    actor: 'user:founder',
  })),
}));
vi.mock('@/lib/ovie/summer-founder-auth', () => ({
  authorizeFounderSummerUser: (id: string) =>
    id === 'founder' ? 'authorized' : 'forbidden',
}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: (...args: unknown[]) => {
    if (state.cacheThrows) throw new Error('cache unavailable');
    state.revalidatedTags.push(args);
  },
  revalidatePath: (path: string) => state.revalidatedPaths.push(path),
}));

export const { MARKETING_PAGE_KIND, DEFAULT_HOME_SPEC } = await import(
  '../marketing-page'
);
export const { contentReviewIdentity, contentApprovalProof } = await import(
  '../publication'
);
export const readyKind = {
  ...MARKETING_PAGE_KIND,
  smoke: () => [],
  renderSmoke: async ({
    identity,
  }: {
    identity: import('../publication').ContentReviewIdentity;
  }) => ({
    reviewDigest: identity.reviewDigest,
    versionId: identity.versionId,
    renderBuildId: identity.renderBuildId,
    errors: [],
  }),
};

export function versionRow(id = 'v5', data: unknown = validSpec()) {
  return {
    id,
    kind: 'marketing-page',
    recordKey: 'home',
    key: 'home',
    version: 5,
    schemaVersion: 1,
    data,
    author: 'agent:summer',
    note: null,
    createdAt: new Date('2026-10-28T00:00:00Z'),
  };
}

export function approvalRow(target = versionRow(), from: string | null = 'v4') {
  const identity = contentReviewIdentity(
    target,
    { commitSha: 'a'.repeat(40), buildId: 'build-a' },
    from
  )!;
  return {
    id: 'approval',
    kind: 'marketing-page',
    recordKey: 'home',
    action: 'approve',
    toVersionId: target.id,
    fromVersionId: from,
    actor: 'user:founder',
    reason: contentApprovalProof(identity),
    createdAt: new Date(),
  };
}

export function liveRow(id = 'v5') {
  return {
    versionId: id,
    version: 5,
    schemaVersion: 1,
    data: validSpec(),
    publishedAt: new Date(),
  };
}

export const publishInput = {
  key: 'home',
  versionId: 'v5',
  actor: 'agent:summer',
  reason: 'subhead',
  expectedLiveVersionId: 'v4',
  approvalId: 'approval',
  operationId: 'publish-operation',
};

export function validSpec() {
  const spec = structuredClone(DEFAULT_HOME_SPEC);
  const hero = spec.sections[0];
  if (hero?.section === 'hero') hero.copy.subhead = 'A free profile for you.';
  return spec;
}

export function resetStoreState() {
  state.tableExists = true;
  state.selectResults = [];
  state.inserts = [];
  state.atomicCalls = [];
  state.revalidatedTags = [];
  state.revalidatedPaths = [];
  state.readThrows = false;
  state.updateResults = [{ versionId: 'changed' }];
  state.updates = [];
  state.cacheThrows = false;
  state.initialPointerConflict = false;
  state.atomicFailure = 'none';
}
