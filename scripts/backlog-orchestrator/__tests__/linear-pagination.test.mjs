import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectLinearConnectionPages,
  fetchTeamActiveIssueSnapshot,
} from '../linear-client.mjs';

describe('exhaustive Linear pagination', () => {
  it('collects every page and emits a complete coverage receipt', async () => {
    const cursors = [];
    const pages = new Map([
      [
        null,
        {
          nodes: [{ id: '1' }, { id: '2' }],
          pageInfo: { hasNextPage: true, endCursor: 'next-1' },
        },
      ],
      [
        'next-1',
        {
          nodes: [{ id: '3' }],
          pageInfo: { hasNextPage: false, endCursor: 'done' },
        },
      ],
    ]);

    const result = await collectLinearConnectionPages(async cursor => {
      cursors.push(cursor);
      return pages.get(cursor);
    });

    assert.deepEqual(cursors, [null, 'next-1']);
    assert.deepEqual(
      result.issues.map(issue => issue.id),
      ['1', '2', '3']
    );
    assert.deepEqual(result.coverage, {
      complete: true,
      pages: 2,
      scanned: 3,
      hasNextPage: false,
      endCursor: 'done',
      reason: null,
    });
  });

  it('fails closed for a repeated cursor instead of looping', async () => {
    let page = 0;
    await assert.rejects(
      collectLinearConnectionPages(async () => {
        page += 1;
        return {
          nodes: [{ id: String(page) }],
          pageInfo: { hasNextPage: true, endCursor: 'same' },
        };
      }),
      error =>
        error?.code === 'CURSOR_STALLED' &&
        error?.coverage?.complete === false &&
        error?.coverage?.reason === 'cursor-did-not-advance'
    );
  });

  it('fails closed for duplicate issues and an open page cap', async () => {
    let page = 0;
    await assert.rejects(
      collectLinearConnectionPages(async () => {
        page += 1;
        return {
          nodes: [{ id: 'duplicate' }],
          pageInfo: {
            hasNextPage: true,
            endCursor: `cursor-${page}`,
          },
        };
      }),
      error =>
        error?.code === 'DUPLICATE_ISSUE' &&
        error?.coverage?.reason === 'duplicate-issue'
    );

    await assert.rejects(
      collectLinearConnectionPages(
        async cursor => ({
          nodes: [{ id: cursor || 'first' }],
          pageInfo: { hasNextPage: true, endCursor: `${cursor || ''}x` },
        }),
        { maxPages: 2 }
      ),
      error =>
        error?.code === 'PAGE_LIMIT' &&
        error?.coverage?.pages === 2 &&
        error?.coverage?.hasNextPage === true
    );
  });

  it('binds active inventory to a terminal page, not a result cap', async () => {
    const requests = [];
    const result = await fetchTeamActiveIssueSnapshot('team-1', {
      graphqlImpl: async (_query, variables) => {
        requests.push(variables);
        if (!variables.cursor) {
          return {
            team: {
              issues: {
                nodes: [{ id: 'one' }],
                pageInfo: { hasNextPage: true, endCursor: 'page-2' },
              },
            },
          };
        }
        return {
          team: {
            issues: {
              nodes: [{ id: 'two' }],
              pageInfo: { hasNextPage: false, endCursor: 'terminal' },
            },
          },
        };
      },
    });

    assert.deepEqual(requests, [
      { teamId: 'team-1', cursor: null },
      { teamId: 'team-1', cursor: 'page-2' },
    ]);
    assert.equal(result.coverage.complete, true);
    assert.equal(result.coverage.scanned, 2);
  });

  it('proves coverage beyond the former 1000-issue ceiling', async () => {
    const total = 1001;
    const pageSize = 50;
    const result = await collectLinearConnectionPages(async cursor => {
      const offset = cursor ? Number(cursor) : 0;
      const remaining = total - offset;
      const count = Math.min(pageSize, remaining);
      const nextOffset = offset + count;
      return {
        nodes: Array.from({ length: count }, (_value, index) => ({
          id: `issue-${offset + index + 1}`,
        })),
        pageInfo: {
          hasNextPage: nextOffset < total,
          endCursor: String(nextOffset),
        },
      };
    });

    assert.equal(result.issues.length, 1001);
    assert.equal(result.coverage.pages, 21);
    assert.equal(result.coverage.complete, true);
    assert.equal(result.coverage.hasNextPage, false);
  });
});
