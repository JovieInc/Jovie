import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as linear from '../linear-client.mjs';
import { reconcileIssues } from '../reconcile.mjs';

const jsonResponse = (
  body,
  { status = 200, contentType = 'application/json' } = {}
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': contentType }),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

function withKey(key, fn) {
  const previous = process.env.LINEAR_API_KEY;
  process.env.LINEAR_API_KEY = key;
  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previous;
  });
}

describe('Gem Linear transport', () => {
  it('accepts valid JSON, preserves the raw Authorization header, and returns data', async () => {
    await withKey('linear-test-secret', async () => {
      let request;
      const data = await linear.graphql(
        'query Viewer { viewer { id } }',
        {},
        {
          fetchImpl: async (_url, options) => {
            request = options;
            return jsonResponse({ data: { viewer: { id: 'viewer-1' } } });
          },
        }
      );
      assert.deepEqual(data, { viewer: { id: 'viewer-1' } });
      assert.ok(request);
      const sent = /** @type {any} */ (request);
      assert.equal(sent.headers.Authorization, 'linear-test-secret');
      assert.equal(sent.headers['Content-Type'], 'application/json');
    });
  });

  it('classifies non-JSON and malformed responses without exposing their body', async () => {
    await withKey('body-secret', async () => {
      await assert.rejects(
        linear.graphql(
          'query Html { viewer { id } }',
          {},
          {
            maxAttempts: 1,
            fetchImpl: async () =>
              jsonResponse('<html>authorization: body-secret</html>', {
                contentType: 'text/html',
              }),
          }
        ),
        error => {
          const err = /** @type {any} */ (error);
          return (
            err.code === 'CONTENT_TYPE' &&
            err.metadata.status === 200 &&
            !JSON.stringify(err).includes('body-secret')
          );
        }
      );

      await assert.rejects(
        linear.graphql(
          'query Broken { viewer { id } }',
          {},
          {
            maxAttempts: 1,
            fetchImpl: async () =>
              jsonResponse('{"data":', {
                contentType: 'application/json; charset=utf-8',
              }),
          }
        ),
        error => {
          const err = /** @type {any} */ (error);
          return err.code === 'INVALID_JSON' && err.attempts === 1;
        }
      );
    });
  });

  it('retries malformed JSON, 429, 5xx, and network failures with bounded backoff', async () => {
    await withKey('retry-secret', async () => {
      for (const sequence of [
        [jsonResponse('{broken'), jsonResponse({ data: { ok: true } })],
        [
          jsonResponse({ error: 'busy' }, { status: 429 }),
          jsonResponse({ data: { ok: true } }),
        ],
        [
          jsonResponse({ error: 'down' }, { status: 503 }),
          jsonResponse({ data: { ok: true } }),
        ],
        [
          Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }),
          jsonResponse({ data: { ok: true } }),
        ],
      ]) {
        let attempts = 0;
        const sleeps = [];
        const data = await linear.graphql(
          'query Retry { viewer { id } }',
          {},
          {
            retryBaseMs: 3,
            fetchImpl: async () => {
              const result =
                sequence[Math.min(attempts++, sequence.length - 1)];
              if (result instanceof Error) throw result;
              return result;
            },
            sleepImpl: async ms => sleeps.push(ms),
          }
        );
        assert.deepEqual(data, { ok: true });
        assert.equal(attempts, 2);
        assert.deepEqual(sleeps, [3]);
      }

      await assert.rejects(
        linear.graphql(
          'query RetryExhausted { viewer { id } }',
          {},
          {
            maxAttempts: 3,
            retryBaseMs: 1,
            fetchImpl: async () =>
              jsonResponse({ error: 'still down' }, { status: 500 }),
            sleepImpl: async () => {},
          }
        ),
        error => {
          const err = /** @type {any} */ (error);
          return (
            err.code === 'SERVER' &&
            err.attempts === 3 &&
            err.metadata.retryable === false
          );
        }
      );
    });
  });

  it('classifies auth, schema, deprecated, and ordinary GraphQL errors', () => {
    assert.equal(
      linear.classifyGraphQLErrors([{ message: 'Unauthorized' }]),
      'AUTH'
    );
    assert.equal(
      linear.classifyGraphQLErrors([
        { message: 'Cannot query field "oldField"' },
      ]),
      'SCHEMA'
    );
    assert.equal(
      linear.classifyGraphQLErrors([
        { message: 'This endpoint is deprecated' },
      ]),
      'DEPRECATED'
    );
    assert.equal(
      linear.classifyGraphQLErrors([{ message: 'something failed' }]),
      'API'
    );
  });

  it('keeps transport metadata allowlisted and bounds/redacts the response body', async () => {
    await withKey('metadata-secret', async () => {
      const body = `${'x'.repeat(400)} token=metadata-secret`;
      await assert.rejects(
        linear.graphql(
          'query Metadata { viewer { id } }',
          {},
          {
            maxAttempts: 1,
            fetchImpl: async () =>
              jsonResponse(body, { contentType: 'text/plain' }),
          }
        ),
        error => {
          const err = /** @type {any} */ (error);
          assert.equal(err.code, 'CONTENT_TYPE');
          assert.deepEqual(Object.keys(err.metadata).sort(), [
            'attempt',
            'contentType',
            'retryable',
            'status',
          ]);
          assert.ok(err.body.length <= linear.LINEAR_MAX_ERROR_BODY_LENGTH + 1);
          assert.doesNotMatch(err.body, /metadata-secret/);
          return true;
        }
      );
    });
  });

  it('preserves supported identifier query and mutation payloads', async () => {
    await withKey('query-secret', async () => {
      const requests = [];
      const fetchImpl = async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return jsonResponse({
          data: requests.at(-1).query.startsWith('mutation')
            ? { issueUpdate: { success: true } }
            : { issues: { nodes: [{ id: 'issue-1' }] } },
        });
      };
      const issue = await linear.fetchIssue('JOV-123', { fetchImpl });
      await linear.transitionIssue('issue-1', 'state-1', { fetchImpl });
      assert.deepEqual(issue, { id: 'issue-1' });
      assert.match(requests[0].query, /issues\s*\(/);
      assert.doesNotMatch(requests[0].query, /issueSearch/);
      assert.deepEqual(requests[0].variables, { teamKey: 'JOV', number: 123 });
      assert.deepEqual(requests[1].variables, {
        id: 'issue-1',
        stateId: 'state-1',
      });
    });
  });
});

describe('Gem reconciliation idempotency', () => {
  it('does not duplicate a classification comment after reread', async () => {
    const issue = {
      id: 'issue-1',
      identifier: 'JOV-1',
      title: 'Transport repair',
      description: 'test',
      labels: { nodes: [] },
      relations: { nodes: [] },
      children: { nodes: [] },
      state: { name: 'Triage', type: 'triage' },
      comments: { nodes: [] },
    };
    let calls = 0;
    const client = {
      addComment: async (_id, body) => {
        calls += 1;
        issue.comments.nodes.push({ body });
      },
    };
    await reconcileIssues({ issues: [issue], client });
    issue.comments.nodes.push({ body: 'persisted' });
    await reconcileIssues({ issues: [issue], client });
    assert.equal(calls, 1);
  });
});
