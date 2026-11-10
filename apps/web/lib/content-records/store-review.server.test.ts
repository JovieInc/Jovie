import { beforeEach, describe, expect, it } from 'vitest';
import {
  approvalRow,
  contentApprovalProof,
  contentReviewIdentity,
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

describe('content record review', () => {
  beforeEach(resetStoreState);
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
});
