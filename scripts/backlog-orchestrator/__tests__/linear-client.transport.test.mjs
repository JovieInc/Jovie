import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import * as linear from '../linear-client.mjs';
import { reconcileIssues } from '../reconcile.mjs';

const jsonResponse = (
  body,
  { status = 200, contentType = 'application/json', headers = {} } = {}
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': contentType, ...headers }),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

let clock = Date.now();
/** @param {string} query @param {any} variables @param {any} options */
function graphql(query, variables, options) {
  return linear.graphql(query, variables, {
    ...options,
    nowImpl: () => clock,
    sleepImpl: async ms => {
      await options.sleepImpl?.(ms);
      clock += ms;
    },
  });
}

function withKey(key, fn) {
  const previous = process.env.LINEAR_API_KEY;
  const previousDir = process.env.LINEAR_BACKOFF_STATE_DIR;
  const directory = fs.mkdtempSync(join(tmpdir(), 'linear-backoff-test-'));
  process.env.LINEAR_BACKOFF_STATE_DIR = directory;
  clock = Date.now();
  process.env.LINEAR_API_KEY = key;
  return Promise.resolve(fn()).finally(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    if (previousDir === undefined) delete process.env.LINEAR_BACKOFF_STATE_DIR;
    else process.env.LINEAR_BACKOFF_STATE_DIR = previousDir;
    if (previous === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previous;
  });
}

describe('Gem Linear transport', () => {
  it('accepts valid JSON, preserves the raw Authorization header, and returns data', async () => {
    await withKey('linear-test-secret', async () => {
      let request;
      const data = await graphql(
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
        graphql(
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
        graphql(
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
        const data = await graphql(
          'query Retry { viewer { id } }',
          {},
          {
            retryBaseMs: 3,
            rateLimitBaseMs: 3,
            randomImpl: () => 0,
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
        graphql(
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
        graphql(
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

describe('Gem Linear rate-limit backoff', () => {
  const rateLimitedResponse = ({ status = 400, headers = {} } = {}) =>
    jsonResponse(
      {
        errors: [
          {
            message: 'Rate limit exceeded',
            extensions: { code: 'RATELIMITED', statusCode: 429 },
          },
        ],
      },
      { status, headers }
    );

  it('retries a RATELIMITED 400 on the rate-limit budget and then succeeds', async () => {
    await withKey('ratelimit-secret', async () => {
      let attempts = 0;
      const sleeps = [];
      const data = await graphql(
        'query RateLimited { viewer { id } }',
        {},
        {
          rateLimitBaseMs: 50,
          randomImpl: () => 0,
          fetchImpl: async () => {
            attempts += 1;
            return attempts === 1
              ? rateLimitedResponse()
              : jsonResponse({ data: { ok: true } });
          },
          sleepImpl: async ms => sleeps.push(ms),
        }
      );
      assert.deepEqual(data, { ok: true });
      assert.equal(attempts, 2);
      assert.deepEqual(sleeps, [50]);
    });
  });

  it('fails fast on a non-rate-limited 400 without retrying', async () => {
    await withKey('plain-400-secret', async () => {
      let attempts = 0;
      const sleeps = [];
      await assert.rejects(
        graphql(
          'query Plain400 { viewer { id } }',
          {},
          {
            fetchImpl: async () => {
              attempts += 1;
              return jsonResponse(
                { errors: [{ message: 'bad request' }] },
                { status: 400 }
              );
            },
            sleepImpl: async ms => sleeps.push(ms),
          }
        ),
        error => {
          const err = /** @type {any} */ (error);
          return err.code === 'HTTP' && err.attempts === 1;
        }
      );
      assert.equal(attempts, 1);
      assert.deepEqual(sleeps, []);
    });
  });

  it('honors Retry-After and X-RateLimit-*-Reset hints over the backoff floor', async () => {
    await withKey('hint-secret', async () => {
      for (const headers of [
        { 'retry-after': '30' },
        { 'x-ratelimit-requests-reset': String(clock + 75_000) },
      ]) {
        const sleeps = [];
        const data = await graphql(
          'query Hints { viewer { id } }',
          {},
          {
            rateLimitBaseMs: 50,
            randomImpl: () => 0,
            fetchImpl: (() => {
              let calls = 0;
              return async () => {
                calls += 1;
                return calls === 1
                  ? rateLimitedResponse({ status: 429, headers })
                  : jsonResponse({ data: { ok: true } });
              };
            })(),
            sleepImpl: async ms => sleeps.push(ms),
          }
        );
        assert.deepEqual(data, { ok: true });
        assert.equal(sleeps.length, 1);
        assert.ok(sleeps[0] >= 29_000 && sleeps[0] <= 46_000);
      }
    });
  });

  it('applies bounded jitter on top of the exponential backoff', async () => {
    await withKey('jitter-secret', async () => {
      const sleeps = [];
      let attempts = 0;
      const data = await graphql(
        'query Jitter { viewer { id } }',
        {},
        {
          rateLimitBaseMs: 100,
          randomImpl: () => 1,
          fetchImpl: async () => {
            attempts += 1;
            return attempts === 1
              ? rateLimitedResponse()
              : jsonResponse({ data: { ok: true } });
          },
          sleepImpl: async ms => sleeps.push(ms),
        }
      );
      assert.deepEqual(data, { ok: true });
      assert.deepEqual(sleeps, [125]);
    });
  });

  it('exhausts the attempt ceiling and throws with attempts/resetAt detail', async () => {
    await withKey('exhausted-secret', async () => {
      let attempts = 0;
      const sleeps = [];
      const before = Date.now();
      await assert.rejects(
        graphql(
          'query Exhausted { viewer { id } }',
          {},
          {
            rateLimitMaxAttempts: 3,
            rateLimitBaseMs: 50,
            randomImpl: () => 0,
            fetchImpl: async () => {
              attempts += 1;
              return rateLimitedResponse({ headers: { 'retry-after': '5' } });
            },
            sleepImpl: async ms => sleeps.push(ms),
          }
        ),
        error => {
          const err = /** @type {any} */ (error);
          assert.equal(err.name, 'LinearTransportError');
          assert.equal(err.code, 'RATE_LIMITED');
          assert.equal(err.attempts, 3);
          assert.equal(err.metadata.retryable, false);
          assert.equal(err.metadata.waitedMs, 10_000);
          assert.ok(err.metadata.resetAt >= before + 5_000);
          return true;
        }
      );
      assert.equal(attempts, 3);
      assert.deepEqual(sleeps, [5_000, 5_000]);
    });
  });

  it('bounds the total wait and fails closed instead of overrunning', async () => {
    await withKey('bounded-secret', async () => {
      let attempts = 0;
      const sleeps = [];
      await assert.rejects(
        graphql(
          'query Bounded { viewer { id } }',
          {},
          {
            rateLimitMaxAttempts: 10,
            rateLimitBaseMs: 1_000,
            rateLimitMaxTotalWaitMs: 1_200,
            randomImpl: () => 0,
            fetchImpl: async () => {
              attempts += 1;
              return rateLimitedResponse();
            },
            sleepImpl: async ms => sleeps.push(ms),
          }
        ),
        error => {
          const err = /** @type {any} */ (error);
          return (
            err.code === 'RATE_LIMITED' &&
            err.attempts === 2 &&
            err.metadata.waitedMs === 1_000
          );
        }
      );
      assert.equal(attempts, 2);
      assert.deepEqual(sleeps, [1_000]);
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
      fetchIssue: async () => structuredClone(issue),
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

describe('durable credential budget', () => {
  const query = 'query Viewer { viewer { id } }';
  const limited = () =>
    jsonResponse('<html>busy</html>', {
      status: 429,
      contentType: 'text/html',
      headers: { 'retry-after': '60' },
    });
  const isLimited = (/** @type {any} */ error) =>
    error.code === 'RATE_LIMITED' &&
    Number.isSafeInteger(error.metadata.resetAt);

  it('persists HTML 429 across independent processes, isolates keys, and resumes at expiry', async () => {
    await withKey('durable-secret', async () => {
      let calls = 0;
      const resetAt = clock + 60_000;
      await assert.rejects(
        graphql(
          query,
          {},
          {
            rateLimitMaxAttempts: 1,
            fetchImpl: async () => {
              calls++;
              return limited();
            },
          }
        ),
        isLimited
      );
      for (let i = 0; i < 2; i++) {
        await assert.rejects(
          graphql(
            query,
            {},
            {
              fetchImpl: async () => {
                calls++;
                return jsonResponse({ data: {} });
              },
            }
          ),
          (/** @type {any} */ error) =>
            isLimited(error) &&
            error.attempts === 0 &&
            error.metadata.resetAt === resetAt
        );
      }
      const child = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { graphql } from ${JSON.stringify(new URL('../linear-client.mjs', import.meta.url).href)};
        let calls = 0;
        try { await graphql('query {}', {}, { nowImpl: () => ${clock}, fetchImpl: async () => { calls++; throw Error('unexpected fetch'); } }); }
        catch (error) { console.log(JSON.stringify({ code: error.code, resetAt: error.metadata?.resetAt, calls })); }
      `,
        ],
        { encoding: 'utf8', env: process.env }
      );
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(JSON.parse(child.stdout), {
        code: 'RATE_LIMITED',
        resetAt,
        calls: 0,
      });
      assert.equal(calls, 1);
      process.env.LINEAR_API_KEY = 'unrelated-secret';
      assert.deepEqual(
        await graphql(
          query,
          {},
          { fetchImpl: async () => jsonResponse({ data: { other: true } }) }
        ),
        { other: true }
      );
      process.env.LINEAR_API_KEY = 'durable-secret';
      clock = resetAt;
      assert.deepEqual(
        await graphql(
          query,
          {},
          {
            fetchImpl: async () => {
              calls++;
              return jsonResponse({ data: { resumed: true } });
            },
          }
        ),
        { resumed: true }
      );
      assert.equal(calls, 2);
    });
  });

  it('uses private persistent user state when no state directory is configured', async () => {
    await withKey('default-location-secret', async () => {
      const home = fs.mkdtempSync(join(tmpdir(), 'linear-default-home-'));
      try {
        const env = /** @type {NodeJS.ProcessEnv} */ ({
          ...process.env,
          HOME: home,
        });
        delete env.LINEAR_BACKOFF_STATE_DIR;
        const child = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `
          import { graphql } from ${JSON.stringify(new URL('../linear-client.mjs', import.meta.url).href)};
          let calls = 0;
          for (let i = 0; i < 2; i++) {
            try { await graphql('query {}', {}, { rateLimitMaxAttempts: 1, fetchImpl: async () => {
              calls++; return { status: 429, headers: new Headers({'retry-after': '60'}), text: async () => { throw Error('body unavailable'); } };
            } }); } catch (error) { if (error.code !== 'RATE_LIMITED') throw error; }
          }
          console.log(calls);
        `,
          ],
          { encoding: 'utf8', env }
        );
        assert.equal(child.status, 0, child.stderr);
        assert.equal(child.stdout.trim(), '1');
        const root = join(home, '.local', 'state', 'jovie-linear-backoff');
        assert.equal(fs.statSync(root).mode & 0o777, 0o700);
        assert.equal(fs.readdirSync(root).length, 1);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });
  });

  it('keeps credential values out of private persisted paths, contents, and errors', async () => {
    await withKey('must-never-be-persisted', async () => {
      await assert.rejects(
        graphql(
          query,
          {},
          { rateLimitMaxAttempts: 1, fetchImpl: async () => limited() }
        ),
        (/** @type {any} */ error) => {
          assert.equal(
            JSON.stringify(error).includes('must-never-be-persisted'),
            false
          );
          return isLimited(error);
        }
      );
      const root = process.env.LINEAR_BACKOFF_STATE_DIR;
      const scopes = fs.readdirSync(root);
      assert.equal(scopes.length, 1);
      assert.match(scopes[0], /^[a-f0-9]{64}$/);
      assert.equal(fs.statSync(join(root, scopes[0])).mode & 0o777, 0o700);
      for (const name of fs.readdirSync(join(root, scopes[0]))) {
        const path = join(root, scopes[0], name);
        assert.equal(fs.statSync(path).mode & 0o777, 0o600);
        assert.equal(
          fs.readFileSync(path, 'utf8').includes('must-never-be-persisted'),
          false
        );
      }
    });
  });

  it('fails closed on malformed or non-private state without making a request', async () => {
    for (const variant of [
      'json',
      'schema',
      'permissions',
      'symlink',
      'directory',
      'pending',
    ]) {
      await withKey('malformed-secret', async () => {
        await assert.rejects(
          graphql(
            query,
            {},
            { rateLimitMaxAttempts: 1, fetchImpl: async () => limited() }
          ),
          isLimited
        );
        const root = process.env.LINEAR_BACKOFF_STATE_DIR;
        const scope = join(root, fs.readdirSync(root)[0]);
        const path = join(scope, fs.readdirSync(scope)[0]);
        if (variant === 'pending')
          fs.writeFileSync(join(scope, '.pending-abcd'), '{', { mode: 0o600 });
        if (variant === 'json') fs.writeFileSync(path, '{');
        if (variant === 'schema')
          fs.writeFileSync(
            path,
            JSON.stringify({ schema: 1, resetAt: 'invalid' })
          );
        if (variant === 'permissions') fs.chmodSync(path, 0o644);
        if (variant === 'directory') fs.chmodSync(scope, 0o755);
        if (variant === 'symlink') {
          fs.unlinkSync(path);
          fs.symlinkSync('/dev/null', path);
        }
        let calls = 0;
        await assert.rejects(
          graphql(
            query,
            {},
            {
              fetchImpl: async () => {
                calls++;
                return limited();
              },
            }
          ),
          (/** @type {any} */ error) => error.code === 'BACKOFF_STATE_INVALID'
        );
        assert.equal(calls, 0);
      });
    }
  });

  it('composes simultaneous cooldown writers by the latest reset without shortening it', async () => {
    await withKey('concurrent-secret', async () => {
      const now = clock;
      await Promise.all(
        [120, 30].map(seconds =>
          assert.rejects(
            graphql(
              query,
              {},
              {
                rateLimitMaxAttempts: 1,
                fetchImpl: async () =>
                  jsonResponse(
                    {},
                    { status: 429, headers: { 'retry-after': String(seconds) } }
                  ),
              }
            ),
            isLimited
          )
        )
      );
      clock = now + 60_000;
      await assert.rejects(
        graphql(
          query,
          {},
          {
            fetchImpl: async () => {
              throw Error('must not fetch');
            },
          }
        ),
        (/** @type {any} */ error) =>
          isLimited(error) && error.metadata.resetAt === now + 120_000
      );
    });
  });

  it('checks another writer extending the reset before an in-call retry', async () => {
    await withKey('extension-secret', async () => {
      let calls = 0;
      await assert.rejects(
        graphql(
          query,
          {},
          {
            rateLimitBaseMs: 10,
            randomImpl: () => 0,
            fetchImpl: async () => {
              calls++;
              return jsonResponse({}, { status: 429 });
            },
            sleepImpl: async () => {
              const root = process.env.LINEAR_BACKOFF_STATE_DIR;
              const scope = join(root, fs.readdirSync(root)[0]);
              const resetAt = clock + 5000;
              fs.writeFileSync(
                join(scope, `${resetAt}-abcd.json`),
                JSON.stringify({ schema: 1, resetAt }),
                { mode: 0o600 }
              );
            },
          }
        ),
        (/** @type {any} */ error) => isLimited(error) && error.attempts === 0
      );
      assert.equal(calls, 1);
    });
  });

  it('fails closed if cooldown publication fails after a 429', async () => {
    await withKey('write-failure-secret', async () => {
      let calls = 0;
      await assert.rejects(
        graphql(
          query,
          {},
          {
            fetchImpl: async () => {
              calls++;
              const root = process.env.LINEAR_BACKOFF_STATE_DIR;
              const scope = join(root, fs.readdirSync(root)[0]);
              fs.rmdirSync(scope);
              fs.writeFileSync(scope, 'blocked', { mode: 0o600 });
              return limited();
            },
          }
        ),
        (/** @type {any} */ error) => error.code === 'BACKOFF_STATE_INVALID'
      );
      assert.equal(calls, 1);
      await assert.rejects(
        graphql(
          query,
          {},
          {
            fetchImpl: async () => {
              calls++;
              return limited();
            },
          }
        ),
        (/** @type {any} */ error) => error.code === 'BACKOFF_STATE_INVALID'
      );
      assert.equal(calls, 1);
    });
  });

  it('retains truthful incomplete pagination when the next page hits a durable cooldown', async () => {
    await withKey('partial-secret', async () => {
      let pages = 0;
      await assert.rejects(
        linear.collectLinearConnectionPages(async () => {
          if (++pages === 1)
            return {
              nodes: [{ id: 'one' }],
              pageInfo: { hasNextPage: true, endCursor: 'page-one' },
            };
          return graphql(
            query,
            {},
            { rateLimitMaxAttempts: 1, fetchImpl: async () => limited() }
          );
        }),
        (/** @type {any} */ error) =>
          error.code === 'PAGE_FETCH_FAILED' &&
          error.coverage.complete === false &&
          error.coverage.pages === 1 &&
          error.coverage.scanned === 1 &&
          error.coverage.endCursor === 'page-one' &&
          Number.isSafeInteger(error.resetAt)
      );
    });
  });
});
