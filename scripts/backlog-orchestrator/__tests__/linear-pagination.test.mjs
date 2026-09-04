import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectLinearConnectionPages,
  fetchTeamActiveIssueSnapshot,
  LinearTransportError,
} from '../linear-client.mjs';

// Mirrors the production payload captured from Linear when the fleet-closure
// snapshot exceeded the 10000 query-complexity ceiling (HTTP 400 INPUT_ERROR).
function complexityError() {
  return new LinearTransportError(
    'Linear GraphQL request failed (http, attempts=1)',
    {
      code: 'HTTP',
      body: JSON.stringify({
        errors: [
          {
            message: 'Query too complex',
            extensions: {
              code: 'INPUT_ERROR',
              userPresentableMessage:
                'The query is too complex. Complexity: 10226. Maximum allowed complexity: 10000.',
            },
          },
        ],
      }),
    }
  );
}

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
      error => {
        const err = /** @type {any} */ (error);
        return (
          err?.code === 'CURSOR_STALLED' &&
          err?.coverage?.complete === false &&
          err?.coverage?.reason === 'cursor-did-not-advance'
        );
      }
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
      error => {
        const err = /** @type {any} */ (error);
        return (
          err?.code === 'DUPLICATE_ISSUE' &&
          err?.coverage?.reason === 'duplicate-issue'
        );
      }
    );

    await assert.rejects(
      collectLinearConnectionPages(
        async cursor => ({
          nodes: [{ id: cursor || 'first' }],
          pageInfo: { hasNextPage: true, endCursor: `${cursor || ''}x` },
        }),
        { maxPages: 2 }
      ),
      error => {
        const err = /** @type {any} */ (error);
        return (
          err?.code === 'PAGE_LIMIT' &&
          err?.coverage?.pages === 2 &&
          err?.coverage?.hasNextPage === true
        );
      }
    );
  });

  it('surfaces attempts and resetAt when a page fetch exhausts rate-limit retries', async () => {
    const cause = new LinearTransportError(
      'Linear GraphQL request failed (rate_limited, attempts=5)',
      {
        code: 'RATE_LIMITED',
        attempts: 5,
        metadata: { retryable: false, resetAt: 1_800_000_000_000 },
      }
    );
    await assert.rejects(
      collectLinearConnectionPages(async () => {
        throw cause;
      }),
      error => {
        const err = /** @type {any} */ (error);
        return (
          err?.name === 'LinearPaginationError' &&
          err?.code === 'PAGE_FETCH_FAILED' &&
          err?.attempts === 5 &&
          err?.resetAt === 1_800_000_000_000 &&
          err?.cause === cause &&
          err?.coverage?.reason === 'page-fetch-failed'
        );
      }
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
      { teamId: 'team-1', cursor: null, pageSize: 50 },
      { teamId: 'team-1', cursor: 'page-2', pageSize: 50 },
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

  describe('query-complexity page-size halving', () => {
    it('retries the same page with a halved page size, then resumes', async () => {
      const calls = [];
      const result = await collectLinearConnectionPages(
        async (cursor, pageSize) => {
          calls.push([cursor, pageSize]);
          if (calls.length === 1) throw complexityError();
          if (!cursor) {
            return {
              nodes: [{ id: '1' }],
              pageInfo: { hasNextPage: true, endCursor: 'page-2' },
            };
          }
          return {
            nodes: [{ id: '2' }],
            pageInfo: { hasNextPage: false, endCursor: 'done' },
          };
        }
      );

      // 50 fails against the ceiling; the same cursor is retried at 25 and
      // the rest of the connection paginates at the reduced size.
      assert.deepEqual(calls, [
        [null, 50],
        [null, 25],
        ['page-2', 25],
      ]);
      assert.deepEqual(
        result.issues.map(issue => issue.id),
        ['1', '2']
      );
      assert.equal(result.coverage.complete, true);
      assert.equal(result.coverage.pages, 2);
    });

    it('fails closed with COMPLEXITY_FLOOR when the floor still fails', async () => {
      const sizes = [];
      await assert.rejects(
        collectLinearConnectionPages(async (_cursor, pageSize) => {
          sizes.push(pageSize);
          throw complexityError();
        }),
        error => {
          const err = /** @type {any} */ (error);
          return (
            err?.name === 'LinearPaginationError' &&
            err?.code === 'COMPLEXITY_FLOOR' &&
            err?.coverage?.complete === false &&
            err?.coverage?.reason === 'complexity-floor' &&
            /10000/.test(err?.message) &&
            err?.cause?.code === 'HTTP'
          );
        }
      );
      assert.deepEqual(sizes, [50, 25, 12, 6]);
    });

    it('does not retry a non-complexity HTTP 400', async () => {
      let calls = 0;
      await assert.rejects(
        collectLinearConnectionPages(async () => {
          calls += 1;
          throw new LinearTransportError(
            'Linear GraphQL request failed (http, attempts=1)',
            {
              code: 'HTTP',
              body: JSON.stringify({
                errors: [
                  {
                    message: 'Invalid filter',
                    extensions: { code: 'INPUT_ERROR' },
                  },
                ],
              }),
            }
          );
        }),
        error => {
          const err = /** @type {any} */ (error);
          return (
            err?.code === 'PAGE_FETCH_FAILED' && err?.cause?.code === 'HTTP'
          );
        }
      );
      assert.equal(calls, 1);
    });

    it('leaves rate-limited failures on the fail-fast path', async () => {
      let calls = 0;
      await assert.rejects(
        collectLinearConnectionPages(async () => {
          calls += 1;
          throw new LinearTransportError(
            'Linear GraphQL request failed (rate_limited, attempts=3)',
            { code: 'RATE_LIMITED' }
          );
        }),
        error => {
          const err = /** @type {any} */ (error);
          return (
            err?.code === 'PAGE_FETCH_FAILED' &&
            err?.cause?.code === 'RATE_LIMITED'
          );
        }
      );
      assert.equal(calls, 1);
    });

    it('threads the halved page size through the fleet snapshot query', async () => {
      const requests = [];
      const queries = [];
      const result = await fetchTeamActiveIssueSnapshot('team-1', {
        graphqlImpl: async (query, variables) => {
          queries.push(query);
          requests.push(variables);
          if (requests.length === 1) throw complexityError();
          return {
            team: {
              issues: {
                nodes: [{ id: 'one' }],
                pageInfo: { hasNextPage: false, endCursor: 'terminal' },
              },
            },
          };
        },
      });

      assert.match(queries[0], /first:\s*\$pageSize/);
      assert.deepEqual(requests, [
        { teamId: 'team-1', cursor: null, pageSize: 50 },
        { teamId: 'team-1', cursor: null, pageSize: 25 },
      ]);
      assert.equal(result.coverage.complete, true);
      assert.equal(result.coverage.scanned, 1);
    });
  });
});
