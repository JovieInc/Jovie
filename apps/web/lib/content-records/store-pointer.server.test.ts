import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  approvalRow,
  liveRow,
  MARKETING_PAGE_KIND,
  publishInput,
  readyKind,
  resetStoreState,
  state,
  validSpec,
  versionRow,
} from './fixtures/content-store.fixture';
import * as store from './store.server';

describe('content record pointer', () => {
  beforeEach(resetStoreState);
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
