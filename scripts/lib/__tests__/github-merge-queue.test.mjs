import { describe, expect, it } from 'vitest';
import {
  annotateNativeMergeQueue,
  fetchNativeMergeQueue,
} from '../github-merge-queue.mjs';

function response(nodes, { hasNextPage = false, endCursor = null } = {}) {
  return {
    data: {
      repository: {
        mergeQueue: {
          entries: {
            nodes,
            pageInfo: { hasNextPage, endCursor },
          },
        },
      },
    },
  };
}

describe('native merge queue inventory', () => {
  it('reads one paginated queue per distinct base branch', async () => {
    const calls = [];
    const positions = await fetchNativeMergeQueue({
      branches: ['main', 'main', 'release'],
      pageSize: 2,
      request: async variables => {
        calls.push(variables);
        if (variables.branch === 'main' && variables.cursor === null) {
          return response(
            [
              { pullRequest: { number: 11 }, position: 1 },
              { pullRequest: { number: 12 }, position: 2 },
            ],
            { hasNextPage: true, endCursor: 'main-next' }
          );
        }
        if (variables.branch === 'main') {
          return response([{ pullRequest: { number: 13 }, position: 3 }]);
        }
        return { data: { repository: { mergeQueue: null } } };
      },
    });

    expect(calls).toEqual([
      { branch: 'main', cursor: null, pageSize: 2 },
      { branch: 'main', cursor: 'main-next', pageSize: 2 },
      { branch: 'release', cursor: null, pageSize: 2 },
    ]);
    expect([...positions]).toEqual([
      [11, 1],
      [12, 2],
      [13, 3],
    ]);
  });

  it('annotates queued and unqueued PRs only after complete inventory', () => {
    const prs = [{ number: 11 }, { number: 12 }];
    expect(annotateNativeMergeQueue(prs, new Map([[12, 4]]))).toEqual([
      { number: 11, isInMergeQueue: false, mergeQueuePosition: null },
      { number: 12, isInMergeQueue: true, mergeQueuePosition: 4 },
    ]);
  });

  it.each([
    [{ data: {} }, 'omitted repository'],
    [
      {
        data: {
          repository: {
            mergeQueue: {
              entries: {
                nodes: [],
                pageInfo: { hasNextPage: true, endCursor: null },
              },
            },
          },
        },
      },
      'omitted its cursor',
    ],
    [
      response([{ pullRequest: { number: 11 }, position: null }]),
      'invalid position',
    ],
  ])('fails closed on incomplete inventory %#', async (payload, message) => {
    await expect(
      fetchNativeMergeQueue({
        branches: ['main'],
        request: async () => payload,
      })
    ).rejects.toThrow(message);
  });
});
