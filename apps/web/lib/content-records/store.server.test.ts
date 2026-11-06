import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
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
  updateResults: [{ versionId: 'changed' }] as unknown[],
  updates: [] as unknown[],
  cacheThrows: false,
  initialPointerConflict: false,
  atomicFailure: 'none' as 'none' | 'before' | 'after',
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
vi.mock('./access.server', () => ({
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

const { MARKETING_PAGE_KIND, DEFAULT_HOME_SPEC } = await import(
  './marketing-page'
);
const store = await import('./store.server');
const { contentReviewIdentity, contentApprovalProof } = await import(
  './publication'
);
const readyKind = {
  ...MARKETING_PAGE_KIND,
  smoke: () => [],
  renderSmoke: async ({
    identity,
  }: {
    identity: import('./publication').ContentReviewIdentity;
  }) => ({
    reviewDigest: identity.reviewDigest,
    versionId: identity.versionId,
    renderBuildId: identity.renderBuildId,
    errors: [],
  }),
};

function versionRow(id = 'v5', data: unknown = validSpec()) {
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

function approvalRow(target = versionRow(), from: string | null = 'v4') {
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

function liveRow(id = 'v5') {
  return {
    versionId: id,
    version: 5,
    schemaVersion: 1,
    data: validSpec(),
    publishedAt: new Date(),
  };
}

const publishInput = {
  key: 'home',
  versionId: 'v5',
  actor: 'agent:summer',
  reason: 'subhead',
  expectedLiveVersionId: 'v4',
  approvalId: 'approval',
  operationId: 'publish-operation',
};

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
    state.updateResults = [{ versionId: 'changed' }];
    state.updates = [];
    state.cacheThrows = false;
    state.initialPointerConflict = false;
    state.atomicFailure = 'none';
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
      [
        {
          versionId: 'v2',
          version: 2,
          schemaVersion: 1,
          data: validSpec(),
          publishedAt,
        },
      ],
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

  it('publishes only approved bytes atomically and reports cache readback separately from delivery', async () => {
    state.selectResults = [
      [],
      [versionRow()],
      [approvalRow()],
      [{ versionId: 'v4' }],
      [liveRow()],
    ];
    const move = await store.publishContentVersion(readyKind, publishInput);
    expect(move).toMatchObject({
      action: 'publish',
      fromVersionId: 'v4',
      toVersionId: 'v5',
      operationId: 'publish-operation',
      cacheInvalidation: 'complete',
      readback: { source: 'live', versionId: 'v5' },
      delivery: 'unverified',
    });
    expect(state.updates).toHaveLength(1);
    const condition = (state.updates[0] as { condition: SQL }).condition;
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"version_id"');
    expect(query.params).toEqual(['marketing-page', 'home', 'v4']);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]?.values).toMatchObject({
      action: 'publish',
      fromVersionId: 'v4',
      toVersionId: 'v5',
    });
    expect(state.revalidatedTags).toEqual([
      ['content-record:marketing-page:home', { expire: 0 }],
    ]);
    expect(state.revalidatedPaths).toEqual(['/']);
  });

  it.each([
    'wrong-payload',
    'wrong-renderer',
    'agent-approval',
    'missing-approval',
  ])('rejects %s before moving the pointer', async kind => {
    const approval = approvalRow();
    if (kind === 'wrong-payload')
      approval.reason = approvalRow(versionRow('v5', { changed: true })).reason;
    if (kind === 'wrong-renderer')
      approval.reason = approval.reason.replaceAll(
        'a'.repeat(40),
        'b'.repeat(40)
      );
    if (kind === 'agent-approval') approval.actor = 'agent:summer';
    state.selectResults = [
      [],
      [versionRow()],
      kind === 'missing-approval' ? [] : [approval],
    ];
    await expect(
      store.publishContentVersion(readyKind, publishInput)
    ).rejects.toBeInstanceOf(store.ContentConflictError);
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
  });

  it('rejects a lost compare-and-swap without an audit row', async () => {
    state.selectResults = [
      [],
      [versionRow()],
      [approvalRow()],
      [{ versionId: 'v4' }],
      [],
    ];
    state.updateResults = [];
    await expect(
      store.publishContentVersion(readyKind, publishInput)
    ).rejects.toBeInstanceOf(store.ContentConflictError);
    expect(state.inserts).toEqual([]);
  });

  it('rejects a newer live version without overwriting it', async () => {
    state.selectResults = [
      [],
      [versionRow()],
      [approvalRow()],
      [{ versionId: 'newer' }],
      [],
    ];
    await expect(
      store.publishContentVersion(readyKind, publishInput)
    ).rejects.toBeInstanceOf(store.ContentConflictError);
    expect(state.updates).toEqual([]);
  });

  it('rejects a first-publication unique-key race without an audit row', async () => {
    state.selectResults = [
      [],
      [versionRow()],
      [approvalRow(versionRow(), null)],
      [],
      [],
    ];
    state.initialPointerConflict = true;
    await expect(
      store.publishContentVersion(readyKind, {
        ...publishInput,
        expectedLiveVersionId: null,
      })
    ).rejects.toBeInstanceOf(store.ContentConflictError);
    expect(
      state.inserts.every(row => !('action' in (row.values as object)))
    ).toBe(true);
    expect(state.revalidatedTags).toEqual([]);
  });

  it('does not describe a missing commit acknowledgement as a failed write', async () => {
    state.selectResults = [[], [versionRow()], [approvalRow()], []];
    state.atomicFailure = 'before';
    await expect(
      store.publishContentVersion(readyKind, publishInput)
    ).rejects.toMatchObject({
      name: 'ContentPublicationUncertainError',
      operationId: publishInput.operationId,
    });
    expect(state.revalidatedTags).toEqual([]);
  });

  it('reconciles an observed committed operation after its acknowledgement was lost', async () => {
    const event = {
      id: publishInput.operationId,
      kind: 'marketing-page',
      recordKey: 'home',
      action: 'publish',
      fromVersionId: 'v4',
      toVersionId: 'v5',
      actor: 'agent:summer',
      reason: JSON.stringify({
        schema: 'content-record-publication/v1',
        approvalId: 'approval',
        reason: 'subhead',
      }),
      createdAt: new Date(),
    };
    state.selectResults = [
      [],
      [versionRow()],
      [approvalRow()],
      [{ versionId: 'v4' }],
      [event],
      [liveRow()],
    ];
    state.atomicFailure = 'after';
    await expect(
      store.publishContentVersion(readyKind, publishInput)
    ).resolves.toMatchObject({ operationId: event.id });
    expect(state.updates).toHaveLength(1);
    expect(state.inserts).toHaveLength(1);
  });

  it('records a decision for the exact preview digest and only from the authenticated founder', async () => {
    const target = versionRow();
    const identity = contentReviewIdentity(
      target,
      { commitSha: 'a'.repeat(40), buildId: 'build-a' },
      'v4'
    )!;
    const approval = { ...approvalRow(target), id: 'decision' };
    state.selectResults = [[target], [{ versionId: 'v4' }], [], [approval]];
    const result = await store.approveContentVersion(
      readyKind,
      {
        key: 'home',
        versionId: target.id,
        decisionId: approval.id,
        reviewDigest: identity.reviewDigest,
        expectedLiveVersionId: 'v4',
      },
      new Request('https://jov.ie', { headers: { origin: 'https://jov.ie' } })
    );
    expect(result).toEqual({ id: approval.id, identity });
    expect(state.inserts[0]?.values).toMatchObject({
      action: 'approve',
      actor: 'user:founder',
      reason: contentApprovalProof(identity),
    });
    expect(state.updates).toEqual([]);
  });

  it('refuses an approval with a changed preview digest or without a real smoke hook', async () => {
    for (const definition of [readyKind, MARKETING_PAGE_KIND]) {
      state.selectResults = [[versionRow()]];
      await expect(
        store.approveContentVersion(
          definition,
          {
            key: 'home',
            versionId: 'v5',
            decisionId: 'decision',
            reviewDigest: 'wrong',
            expectedLiveVersionId: 'v4',
          },
          new Request('https://jov.ie')
        )
      ).rejects.toBeInstanceOf(store.ContentConflictError);
    }
    expect(state.inserts).toEqual([]);
  });

  it('labels old-schema live data as a default fallback rather than serving it as the approved version', async () => {
    state.selectResults = [[liveRow()]];
    await expect(
      store.getLiveContent({ ...MARKETING_PAGE_KIND, schemaVersion: 2 }, 'home')
    ).resolves.toMatchObject({
      source: 'default',
      versionId: null,
      fallbackReason: 'incompatible',
    });
  });

  it('reports committed but uncertain invalidation truthfully', async () => {
    state.selectResults = [
      [],
      [versionRow()],
      [approvalRow()],
      [{ versionId: 'v4' }],
      [liveRow('v4')],
    ];
    state.cacheThrows = true;
    const moved = await store.publishContentVersion(readyKind, publishInput);
    expect(moved).toMatchObject({
      cacheInvalidation: 'uncertain',
      readback: { versionId: 'v4' },
      delivery: 'unverified',
    });
    expect(state.inserts).toHaveLength(1);
  });

  it('reconciles the same operation without another pointer write', async () => {
    const event = {
      id: publishInput.operationId,
      kind: 'marketing-page',
      recordKey: 'home',
      action: 'publish',
      fromVersionId: 'v4',
      toVersionId: 'v5',
      actor: 'agent:summer',
      reason: JSON.stringify({
        schema: 'content-record-publication/v1',
        approvalId: 'approval',
        reason: 'subhead',
      }),
      createdAt: new Date(),
    };
    state.selectResults = [[event], [versionRow()], [liveRow()]];
    await expect(
      store.publishContentVersion(readyKind, publishInput)
    ).resolves.toMatchObject({ operationId: event.id });
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
  });

  it('can reconcile a committed receipt after the renderer schema or smoke gate changes', async () => {
    const event = {
      id: publishInput.operationId,
      kind: 'marketing-page',
      recordKey: 'home',
      action: 'publish',
      fromVersionId: 'v4',
      toVersionId: 'v5',
      actor: 'agent:summer',
      reason: JSON.stringify({
        schema: 'content-record-publication/v1',
        approvalId: 'approval',
        reason: 'subhead',
      }),
      createdAt: new Date(),
    };
    state.selectResults = [[event], [versionRow()], [liveRow()]];
    const smoke = vi.fn(() => ['new renderer failure']);
    const result = await store.publishContentVersion(
      { ...readyKind, schemaVersion: 2, smoke },
      publishInput
    );
    expect(result).toMatchObject({
      operationId: event.id,
      readback: { source: 'default', versionId: null },
      delivery: 'unverified',
    });
    expect(smoke).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
  });

  it.each([
    'missing',
    'wrong-version',
    'wrong-build',
    'wrong-digest',
    'failed',
  ])(
    'rejects %s actual-render evidence even when structural smoke passes',
    async defect => {
      state.selectResults = [[], [versionRow()], [approvalRow()]];
      const definition = {
        ...readyKind,
        renderSmoke:
          defect === 'missing'
            ? undefined
            : async (
                input: Parameters<NonNullable<typeof readyKind.renderSmoke>>[0]
              ) => ({
                versionId:
                  defect === 'wrong-version'
                    ? 'other'
                    : input.identity.versionId,
                renderBuildId:
                  defect === 'wrong-build'
                    ? 'other-build'
                    : input.identity.renderBuildId,
                reviewDigest:
                  defect === 'wrong-digest'
                    ? 'forged'
                    : input.identity.reviewDigest,
                errors: defect === 'failed' ? ['render failed'] : [],
              }),
      };
      await expect(
        store.publishContentVersion(definition, publishInput)
      ).rejects.toBeInstanceOf(
        defect === 'missing'
          ? store.ContentConflictError
          : store.ContentValidationError
      );
      expect(state.updates).toEqual([]);
      expect(state.inserts).toEqual([]);
    }
  );

  it('rejects an editorial publish without an exact founder approval before moving the pointer', async () => {
    state.selectResults = [
      [
        {
          id: 'unapproved',
          kind: 'marketing-page',
          recordKey: 'home',
          version: 8,
          schemaVersion: 1,
          data: validSpec(),
          author: 'agent:summer',
          note: null,
          createdAt: new Date(),
        },
      ],
      [{ versionId: 'previous' }],
    ];
    await expect(
      store.publishContentVersion(MARKETING_PAGE_KIND, {
        key: 'home',
        versionId: 'unapproved',
        actor: 'agent:summer',
      })
    ).rejects.toBeInstanceOf(store.ContentConflictError);
    expect(state.inserts).toEqual([]);
    expect(state.revalidatedTags).toEqual([]);
  });

  it('runs the current render smoke gate again at publication', async () => {
    state.selectResults = [
      [],
      [
        {
          id: 'broken-render',
          kind: 'marketing-page',
          recordKey: 'home',
          version: 8,
          schemaVersion: 1,
          data: validSpec(),
          author: 'agent:summer',
          note: null,
          createdAt: new Date(),
        },
      ],
      [{ versionId: 'previous' }],
    ];
    const definition = {
      ...MARKETING_PAGE_KIND,
      smoke: () => ['A required section did not render'],
    };
    await expect(
      store.publishContentVersion(definition, {
        ...publishInput,
        versionId: 'broken-render',
      })
    ).rejects.toBeInstanceOf(store.ContentValidationError);
    expect(state.inserts).toEqual([]);
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

  it('rolls back with the same current-renderer approval and compare-and-swap requirements', async () => {
    state.selectResults = [
      [],
      [{ fromVersionId: 'v4' }],
      [],
      [versionRow('v4')],
      [approvalRow(versionRow('v4'), 'v5')],
      [{ versionId: 'v5' }],
      [liveRow('v4')],
    ];
    const move = await store.rollbackContent(readyKind, {
      key: 'home',
      actor: 'user:founder',
      reason: 'revert',
      expectedLiveVersionId: 'v5',
      approvalId: 'approval',
      operationId: 'rollback-operation',
    });
    expect(move).toMatchObject({
      action: 'rollback',
      fromVersionId: 'v5',
      toVersionId: 'v4',
      delivery: 'unverified',
    });
  });

  it('uses the durable target for a default-rollback retry instead of toggling to a newer history target', async () => {
    const event = {
      id: 'rollback-operation',
      kind: 'marketing-page',
      recordKey: 'home',
      action: 'rollback',
      fromVersionId: 'v5',
      toVersionId: 'v4',
      actor: 'user:founder',
      reason: JSON.stringify({
        schema: 'content-record-publication/v1',
        approvalId: 'approval',
        reason: 'revert',
      }),
      createdAt: new Date(),
    };
    state.selectResults = [
      [event],
      [event],
      [versionRow('v4')],
      [liveRow('v4')],
    ];
    await expect(
      store.rollbackContent(readyKind, {
        key: 'home',
        actor: 'user:founder',
        reason: 'revert',
        expectedLiveVersionId: 'v5',
        approvalId: 'approval',
        operationId: event.id,
      })
    ).resolves.toMatchObject({ toVersionId: 'v4', operationId: event.id });
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
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
