import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { main, status, summarize } from './cli.ts';
import { createFakeProvider, FakeClock } from './fake-provider.ts';
import { type GhRunner, ghShape, runGh, splitIncluded } from './gh.ts';
import { createGitHubClient, pullRequestField } from './github.ts';
import { githubBudgetHooks } from './legacy.ts';
import { createLinearClient, issueField, linearScope } from './linear.ts';
import { credentialState } from './policy.ts';
import { FileLedgerStore, MemoryLedgerStore } from './store.ts';

const quiet = () => undefined;

function github(handler?: Parameters<typeof createFakeProvider>[0]['handler']) {
  const clock = new FakeClock();
  const fake = createFakeProvider({ style: 'github', clock, handler });
  const gh = createGitHubClient({
    token: 't',
    credential: 'app-installation:1',
    store: new MemoryLedgerStore(),
    fetch: fake.fetch,
    now: clock.read,
    sleep: clock.sleep,
    log: quiet,
  });
  return { clock, fake, gh };
}

describe('GitHub adapter', () => {
  it('batches PR reads into aliased GraphQL queries of 50', async () => {
    const { fake, gh } = github(({ body }) => {
      const aliases = [
        ...(JSON.parse(body ?? '{}').query as string).matchAll(/k(\d+):/g),
      ];
      return {
        body: {
          data: Object.fromEntries(
            aliases.map(([, j]) => [
              `k${j}`,
              j === '0'
                ? null
                : { repository: { pullRequest: { number: Number(j) } } },
            ])
          ),
        },
      };
    });
    const numbers = Array.from({ length: 120 }, (_, i) => String(i + 1));
    const prs = await gh.batch(
      numbers,
      pullRequestField('JovieInc', 'Jovie', 'number state')
    );
    expect(fake.calls).toHaveLength(3);
    expect(prs.size).toBe(120);
    expect(prs.get('1')).toBeNull();
  });

  it('follows Link pagination and reuses ETags on the next sweep', async () => {
    const { fake, gh } = github(({ url }) => {
      const page = Number(url.searchParams.get('page') ?? '1');
      const headers: Record<string, string> =
        page < 2
          ? {
              link: `<https://api.github.com/repos/o/r/pulls?page=${page + 1}>; rel="next"`,
            }
          : {};
      return { body: [{ page }], headers };
    });
    expect(await gh.paginate('repos/o/r/pulls')).toEqual([
      { page: 1 },
      { page: 2 },
    ]);
    await gh.paginate('repos/o/r/pulls', { priority: 'poll' });
    expect(fake.calls.map(c => c.status)).toEqual([200, 200, 304, 304]);
  });

  it('turns a GraphQL RATE_LIMITED 200 into a deferral, not a verdict', async () => {
    const { fake, gh } = github();
    fake.fault({ kind: 'graphql-rate-limited' });
    await expect(
      gh.graphql('{ viewer { login } }', {}, { maxWaitMs: 0 })
    ).rejects.toMatchObject({ exitCode: 75, failure: 'primary' });
  });

  it('reads and writes the gh shim budget file instead of keeping a second ledger', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gh-budget-'));
    const clock = new FakeClock();
    const fake = createFakeProvider({ style: 'github', clock });
    const path = join(root, 'github-budget.json');
    await writeFile(
      path,
      JSON.stringify({
        remaining: 100,
        resetAt: Math.floor(clock.now / 1000) + 600,
        observedAt: clock.now / 1000,
      })
    );
    const gh = createGitHubClient({
      token: 't',
      store: new MemoryLedgerStore(),
      fetch: fake.fetch,
      now: clock.read,
      sleep: clock.sleep,
      log: quiet,
      hooks: githubBudgetHooks(root),
    });
    await expect(
      gh.graphql('{ a }', {}, { priority: 'poll' })
    ).rejects.toMatchObject({ kind: 'shed' });
    expect(fake.calls).toHaveLength(0);
    await gh.graphql('{ a }', {}, { priority: 'merge' });
    const written = JSON.parse(await readFile(path, 'utf8'));
    expect(written).toMatchObject({
      remaining: fake.budget('graphql').remaining,
      resetAt: Math.floor(fake.budget('graphql').resetAt / 1000),
    });
  });
});

describe('Linear adapter', () => {
  async function linear(root: string) {
    const clock = new FakeClock();
    const fake = createFakeProvider({ style: 'linear', clock });
    const tokens: string[] = [];
    const client = createLinearClient({
      identity: 'linear-app:client-1',
      authorization: rejected => {
        tokens.push(rejected ?? 'first');
        return `Bearer ${tokens.length}`;
      },
      legacyStateRoot: root,
      store: new MemoryLedgerStore(),
      fetch: fake.fetch,
      now: clock.read,
      sleep: clock.sleep,
      log: quiet,
    });
    return { clock, fake, client, tokens };
  }

  it('publishes the lanes cooldown and api-budget.json when Linear says RATELIMITED', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linear-legacy-'));
    const { fake, client } = await linear(root);
    await client.graphql('{ viewer { id } }');
    const snapshot = JSON.parse(
      await readFile(join(root, 'api-budget.json'), 'utf8')
    );
    expect(snapshot).toMatchObject({
      schema: 1,
      limit: 5000,
      dimensions: {
        requests: { limit: 5000 },
        complexity: { limit: 3_000_000 },
      },
    });
    fake.setRemaining('requests', 0);
    await expect(
      client.graphql('{ viewer { id } }', {}, { maxWaitMs: 0 })
    ).rejects.toMatchObject({ failure: 'primary' });
    const records = await readdir(
      join(root, 'linear-cooldown', linearScope('linear-app:client-1'))
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatch(/^\d+-[0-9a-f-]+\.json$/);
  });

  it('honors a cooldown another process published, without a network call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linear-legacy-'));
    const { clock, fake, client } = await linear(root);
    const dir = join(root, 'linear-cooldown', client.scope);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(
        dir,
        `${clock.now + 60_000}-00000000-0000-0000-0000-000000000000.json`
      ),
      '{"schema":1}'
    );
    await expect(
      client.graphql('{ a }', {}, { priority: 'poll' })
    ).rejects.toMatchObject({ kind: 'shed' });
    await expect(
      client.graphql('{ a }', {}, { priority: 'default', maxWaitMs: 0 })
    ).rejects.toMatchObject({ kind: 'budget' });
    expect(fake.calls).toHaveLength(0);
  });

  it('re-mints once after a 401 and batches issue reads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linear-legacy-'));
    const clock = new FakeClock();
    let seen = 0;
    const fake = createFakeProvider({
      style: 'linear',
      clock,
      handler: ({ headers, body }) => {
        seen += 1;
        if (headers.get('authorization') === 'Bearer 1')
          return { status: 401, body: { errors: [{ message: 'expired' }] } };
        const aliases = [
          ...(JSON.parse(body ?? '{}').query as string).matchAll(/k(\d+):/g),
        ];
        return {
          body: {
            data: Object.fromEntries(
              aliases.map(([, j]) => [`k${j}`, { identifier: `JOV-${j}` }])
            ),
          },
        };
      },
    });
    let n = 0;
    const client = createLinearClient({
      identity: 'k',
      authorization: () => `Bearer ${++n}`,
      legacyStateRoot: root,
      store: new MemoryLedgerStore(),
      fetch: fake.fetch,
      now: clock.read,
      sleep: clock.sleep,
      log: quiet,
    });
    const issues = await client.batch(
      ['JOV-1', 'JOV-2', 'JOV-1'],
      issueField('identifier')
    );
    expect(issues.size).toBe(2);
    expect(seen).toBe(2);
  });
});

describe('gh through the ledger', () => {
  const logArgs = [
    'run',
    'view',
    '--repo',
    'o/r',
    '--job',
    '12',
    '--attempt',
    '2',
    '--log',
  ];

  it('refreshes depleted quota for only the active credential without spending quota', async () => {
    const clock = new FakeClock();
    const store = new MemoryLedgerStore();
    const reset = clock.now + 60000;
    await store.transact('github', ledger => {
      for (const [credential, remaining] of [
        ['c', 0],
        ['other-installation', 123],
      ] as const)
        credentialState(ledger, credential, clock.now).buckets.core = {
          limit: 5000,
          remaining,
          resetAt: reset,
          observedAt: clock.now,
        };
    });
    const result = await runGh(['api', 'rate_limit'], {
      priority: 'report',
      store,
      credential: 'c',
      now: clock.read,
      maxWaitMs: 0,
      log: quiet,
      run: async () => ({
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          resources: {
            core: { limit: 5000, remaining: 0, reset: reset / 1000 },
            graphql: { limit: 5000, remaining: 37, reset: reset / 1000 },
            search: { limit: 5000, remaining: 9, reset: reset / 1000 },
          },
        }),
      }),
    });
    expect(result.code).toBe(0);
    const { credentials } = await store.read('github');
    expect(
      Object.fromEntries(
        Object.entries(credentials.c!.buckets).map(([name, row]) => [
          name,
          row.remaining,
        ])
      )
    ).toEqual({ core: 0, graphql: 37, search: 9 });
    expect(credentials['other-installation']!.buckets.core!.remaining).toBe(
      123
    );
    expect(ghShape(['api', '-X', 'GET', '/rate_limit']).cost).toBe(0);
    for (const args of [
      ['api', 'rate_limit', '-f', 'x=y'],
      ['api', '-X', 'POST', 'rate_limit'],
      ['api', 'repos/o/r/rate_limit'],
      ['api', 'https://untrusted.test/rate_limit'],
    ])
      expect(ghShape(args).cost).not.toBe(0);
  });

  it.each([
    [0, 1],
    [1, 0],
  ])(
    'preserves shared in-flight debits when response %i precedes %i',
    async (first, second) => {
      const clock = new FakeClock();
      const root = await mkdtemp(join(tmpdir(), 'gh-shared-budget-'));
      const store = new FileLedgerStore(root, clock.read);
      const reset = clock.now + 60000;
      await store.transact('github', ledger => {
        credentialState(ledger, 'c', clock.now).buckets.core = {
          limit: null,
          remaining: 2,
          resetAt: reset,
          observedAt: clock.now,
        };
      });
      const base = {
        priority: 'repair' as const,
        store,
        credential: 'c',
        now: clock.read,
        log: quiet,
        maxWaitMs: 0,
      };
      const releases: Array<() => void> = [];
      const requests: Array<ReturnType<typeof runGh>> = [];
      for (let index = 0; index < 2; index += 1) {
        let started!: () => void;
        const entered = new Promise<void>(resolve => {
          started = resolve;
        });
        const pending = new Promise<void>(resolve => {
          releases[index] = resolve;
        });
        requests[index] = runGh(['api', 'repos/o/r/pulls'], {
          ...base,
          run: async () => {
            started();
            await pending;
            return {
              code: 0,
              stderr: '',
              stdout: `HTTP/2.0 200 OK\nX-Ratelimit-Remaining: ${1 - index}\nX-Ratelimit-Reset: ${reset / 1000}\n\n[]`,
            };
          },
        });
        await entered;
      }
      try {
        releases[first]!();
        await requests[first];
        const denied = await runGh(['api', 'repos/o/r/pulls'], {
          ...base,
          run: async () => {
            throw new Error('reserved quota spent twice');
          },
        });
        expect(denied.code).toBe(75);
      } finally {
        releases[second]!();
        await Promise.all(requests);
      }
      expect(
        (await store.read('github')).credentials.c!.buckets.core!.remaining
      ).toBe(0);
      clock.now = reset;
      await runGh(['api', 'rate_limit'], {
        ...base,
        run: async () => ({
          code: 0,
          stderr: '',
          stdout: JSON.stringify({
            resources: {
              core: {
                limit: 5000,
                remaining: 5000,
                reset: reset / 1000 + 3600,
              },
            },
          }),
        }),
      });
      expect(
        (await store.read('github')).credentials.c!.buckets.core!.remaining
      ).toBe(5000);
    }
  );

  it('does not execute transport after an unpersisted admission', async () => {
    const clock = new FakeClock();
    const root = await mkdtemp(join(tmpdir(), 'gh-locked-budget-'));
    const store = new FileLedgerStore(root, clock.read, { lockTimeoutMs: 0 });
    await store.transact('github', ledger => {
      credentialState(ledger, 'c', clock.now).buckets.core = {
        limit: null,
        remaining: 2,
        resetAt: clock.now + 60000,
        observedAt: clock.now,
      };
    });
    const lock = join(root, 'api-ledger/github.lock.d');
    await mkdir(lock);
    await writeFile(join(lock, 'owner'), 'other-process');
    const result = await runGh(['api', 'repos/o/r/pulls'], {
      store,
      credential: 'c',
      now: clock.read,
      log: quiet,
      run: async () => {
        throw new Error('transport must wait for durable admission');
      },
    });
    expect(result).toMatchObject({ code: 75, deferred: true });
    expect(
      (await store.read('github')).credentials.c!.buckets.core!.remaining
    ).toBe(2);
    expect(await readFile(join(lock, 'owner'), 'utf8')).toBe('other-process');
  });

  it('prefers quota headers and ignores malformed resource evidence', async () => {
    const clock = new FakeClock();
    const store = new MemoryLedgerStore();
    const reset = clock.now / 1000 + 60;
    const body = JSON.stringify({
      resources: {
        core: { limit: 100, remaining: 90, reset },
        graphql: { limit: 100, remaining: true, reset },
        search: { limit: 100, remaining: 101, reset },
      },
    });
    const result = await runGh(['api', 'rate_limit'], {
      store,
      credential: 'c',
      now: clock.read,
      log: quiet,
      run: async () => ({
        code: 0,
        stderr: '',
        stdout: `HTTP/2.0 200 OK\nX-Ratelimit-Limit: 100\nX-Ratelimit-Remaining: 0\nX-Ratelimit-Reset: ${reset}\n\n${body}`,
      }),
    });
    expect(result.code).toBe(0);
    const { buckets } = (await store.read('github')).credentials.c!;
    expect(Object.keys(buckets)).toEqual(['core']);
    expect(buckets.core!.remaining).toBe(0);
  });

  it('costs only the bounded safe job-log shape as five REST reads', () => {
    const expected = {
      resource: 'core',
      write: false,
      idempotent: true,
      cost: 5,
    };
    expect(ghShape(logArgs)).toEqual(expected);
    expect(ghShape([...logArgs.slice(0, 2), ...logArgs.slice(4)])).toEqual(
      expected
    );
    for (const args of [
      logArgs.slice(0, -1),
      [...logArgs, '--log-failed'],
      [...logArgs.slice(0, 5), '0', ...logArgs.slice(6)],
      [...logArgs.slice(0, 7), '-1', '--log'],
      ['run', 'view', '12', '--log'],
    ]) {
      expect(ghShape(args)).not.toHaveProperty('cost');
    }
  });

  it.each([
    [4, 0],
    [5, 1],
  ])(
    'reserves five core reads with remaining=%i before execution',
    async (remaining, expectedCalls) => {
      const clock = new FakeClock();
      const store = new MemoryLedgerStore();
      const seen: string[][] = [];
      await store.transact('github', ledger => {
        credentialState(ledger, 'c', clock.now).buckets.core = {
          limit: null,
          remaining,
          resetAt: clock.now + 60000,
          observedAt: clock.now,
        };
      });
      const result = await runGh(logArgs, {
        priority: 'repair',
        store,
        credential: 'c',
        now: clock.read,
        sleep: clock.sleep,
        log: quiet,
        maxAttempts: 1,
        maxWaitMs: 0,
        run: async args => {
          seen.push([...args]);
          return { code: 0, stdout: 'safe log', stderr: '' };
        },
      });
      expect(seen).toHaveLength(expectedCalls);
      expect(result.code).toBe(expectedCalls ? 0 : 75);
      expect(clock.now).toBe(new FakeClock().now);
      if (seen.length) {
        expect(seen).toEqual([logArgs]);
        expect(
          await store.transact(
            'github',
            ledger => ledger.credentials.c?.buckets.core?.remaining
          )
        ).toBe(0);
      }
    }
  );

  it('classifies gh invocations by bucket and mutation', () => {
    expect(ghShape(['api', 'repos/o/r/pulls'])).toEqual({
      resource: 'core',
      write: false,
      idempotent: true,
    });
    expect(
      ghShape(['api', '-X', 'PATCH', 'repos/o/r/pulls/1', '-f', 'state=closed'])
    ).toMatchObject({ write: true, idempotent: false });
    expect(
      ghShape(['api', 'repos/o/r/issues/1/comments', '-f', 'body=x'])
    ).toMatchObject({ write: true });
    expect(ghShape(['api', '-X', 'GET', 'search/issues', '-f', 'q=x'])).toEqual(
      { resource: 'search', write: false, idempotent: true }
    );
    expect(
      ghShape(['api', 'graphql', '-f', 'query=mutation { x }'])
    ).toMatchObject({ resource: 'graphql', write: true });
    expect(ghShape(['pr', 'list'])).toEqual({
      resource: 'graphql',
      write: false,
      idempotent: true,
    });
    expect(ghShape(['pr', 'merge', '1'])).toMatchObject({ write: true });
  });

  it('splits --include output into headers and body', () => {
    expect(
      splitIncluded('HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 7\n\n{"a":1}')
    ).toEqual({ headers: { 'x-ratelimit-remaining': '7' }, body: '{"a":1}' });
    expect(splitIncluded('{"a":1}')).toBeNull();
  });

  it('retries a secondary limit, records the budget, then defers polls below the reserve', async () => {
    const clock = new FakeClock();
    const store = new MemoryLedgerStore();
    const replies = [
      {
        code: 1,
        stdout: '',
        stderr: 'gh: You have exceeded a secondary rate limit (HTTP 403)',
      },
      {
        code: 0,
        stdout: `HTTP/2.0 200 OK\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 200\nX-Ratelimit-Reset: ${Math.floor(clock.now / 1000) + 900}\nX-Ratelimit-Resource: core\n\n[]`,
        stderr: '',
      },
    ];
    const run: GhRunner = async () =>
      replies.shift() ?? { code: 0, stdout: '[]', stderr: '' };
    const base = {
      store,
      credential: 'c',
      run,
      now: clock.read,
      sleep: clock.sleep,
      random: () => 0,
      log: quiet,
    };
    const first = await runGh(['api', 'repos/o/r/pulls'], {
      ...base,
      priority: 'merge',
    });
    expect(first).toMatchObject({ code: 0, stdout: '[]', deferred: false });
    expect(clock.now - new FakeClock().now).toBeGreaterThanOrEqual(60_000);
    const poll = await runGh(['api', 'repos/o/r/pulls'], {
      ...base,
      priority: 'poll',
    });
    expect(poll).toMatchObject({ code: 75, deferred: true });
  });

  it('passes real gh failures through without retrying', async () => {
    let calls = 0;
    const run: GhRunner = async () => {
      calls += 1;
      return {
        code: 1,
        stdout: '',
        stderr:
          'GraphQL: Could not resolve to a PullRequest with the number of 9.',
      };
    };
    const clock = new FakeClock();
    const result = await runGh(['pr', 'view', '9'], {
      store: new MemoryLedgerStore(),
      credential: 'c',
      run,
      now: clock.read,
      sleep: clock.sleep,
      log: quiet,
    });
    expect(result).toMatchObject({ code: 1, deferred: false });
    expect(calls).toBe(1);
  });
});

describe('status summary', () => {
  it('reports live buckets, breaker state and last-hour usage per credential', async () => {
    const { clock, gh } = github();
    await gh.rest('GET', 'repos/o/r');
    const state = await gh.client.state();
    const summary = summarize(
      [
        {
          schema: 'jovie-api-ledger/v1',
          provider: 'github',
          credentials: { 'app-installation:1': state! },
        },
      ],
      clock.now
    );
    expect(
      summary.providers.github?.credentials['app-installation:1']
    ).toMatchObject({
      buckets: { core: { remaining: 4999, limit: 5000 } },
      breaker: { state: 'closed', openUntil: null },
      usage: { default: { attempts: 1, ok: 1 } },
    });
  });

  it('prints an empty status and rejects unknown commands', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'api-status-'));
    expect((await status(new FileLedgerStore(dir))).providers).toEqual({});
    expect(await main(['bogus'])).toBe(2);
  });
});
