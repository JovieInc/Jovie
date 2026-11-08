import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approvalRow,
  liveRow,
  publishInput,
  readyKind,
  resetStoreState,
  state,
  versionRow,
} from './fixtures/content-store.fixture';
import * as store from './store.server';

describe('content record reconciliation', () => {
  beforeEach(resetStoreState);
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
});
