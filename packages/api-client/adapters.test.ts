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
