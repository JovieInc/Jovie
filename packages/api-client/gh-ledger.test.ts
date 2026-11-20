import { describe, expect, it } from 'vitest';

import { FakeClock } from './fake-provider.ts';
import {
  type GhRunner,
  ghShape,
  ghWantsFileStdout,
  runGh,
  splitIncluded,
} from './gh.ts';

import { credentialState } from './policy.ts';
import { MemoryLedgerStore } from './store.ts';

const quiet = () => undefined;

describe('gh through the ledger', () => {
  it('backs off free probes on secondary limits even when the core header is zero', async () => {
    const clock = new FakeClock();
    const store = new MemoryLedgerStore();
    let calls = 0;
    const run: GhRunner = async () => {
      calls += 1;
      const denied = calls === 1;
      return {
        code: denied ? 1 : 0,
        stdout: `HTTP/2.0 ${denied ? '429 Too Many Requests' : '200 OK'}\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 0\nX-Ratelimit-Reset: ${Math.floor(clock.now / 1000) + 900}\nX-Ratelimit-Resource: core\nRetry-After: 60\n\n${denied ? 'secondary rate limit' : '{}'}`,
        stderr: '',
      };
    };
    const options = {
      store,
      credential: 'dual-limit',
      run,
      now: clock.read,
      sleep: clock.sleep,
      log: quiet,
      maxWaitMs: 0,
      priority: 'poll' as const,
    };
    expect(await runGh(['api', 'rate_limit'], options)).toMatchObject({
      code: 75,
      deferred: true,
    });
    expect(await runGh(['api', 'rate_limit'], options)).toMatchObject({
      code: 75,
      deferred: true,
    });
    expect(calls).toBe(1);
    await clock.sleep(60_001);
    expect(await runGh(['api', 'rate_limit'], options)).toMatchObject({
      code: 75,
      deferred: true,
    });
    expect(calls).toBe(1);
    // Preserve the later empty-core reset as well as the secondary Retry-After.
    await clock.sleep(840_000);
    expect(await runGh(['api', 'rate_limit'], options)).toMatchObject({
      code: 0,
      deferred: false,
    });
    expect(calls).toBe(2);
    expect(await runGh(['api', 'repos/o/r'], options)).toMatchObject({
      code: 75,
      deferred: true,
    });
    expect(calls).toBe(2);
  });

  it('reads free quota observations at core zero while charged calls remain shed', async () => {
    const clock = new FakeClock();
    const store = new MemoryLedgerStore();
    let calls = 0;
    const run: GhRunner = async () => {
      calls += 1;
      return {
        code: 0,
        stdout: `HTTP/2.0 200 OK\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 0\nX-Ratelimit-Reset: ${Math.floor(clock.now / 1000) + 900}\nX-Ratelimit-Resource: core\n\n{}`,
        stderr: '',
      };
    };
    const base = {
      store,
      credential: 'free-probe',
      run,
      now: clock.read,
      sleep: clock.sleep,
      log: quiet,
      maxWaitMs: 0,
    };
    await runGh(['api', 'repos/o/r'], { ...base, priority: 'merge' });
    for (const target of [
      'rate_limit',
      '/rate_limit',
      'https://api.github.com/rate_limit',
    ]) {
      expect(
        await runGh(['api', target], { ...base, priority: 'poll' })
      ).toMatchObject({ code: 0, deferred: false });
    }
    expect(calls).toBe(4);
    expect(
      (await store.read('github')).credentials['free-probe'].buckets.core
        .remaining
    ).toBe(0);
    for (const args of [
      ['api', 'repos/o/r'],
      ['api', 'rate_limit/other'],
      ['api', 'https://example.com/rate_limit'],
      ['api', 'rate_limit', '-X', 'POST'],
      ['api', 'rate_limit', '-X', 'HEAD'],
      ['api', 'rate_limit', '-XPOST'],
      ['api', 'rate_limit', '--method=POST'],
      ['api', 'rate_limit', '-ffield=x'],
      ['api', 'rate_limit', '-Ffield=x'],
      ['api', 'rate_limit', '--field=field=x'],
      ['api', 'rate_limit', '--raw-field=field=x'],
      ['api', 'rate_limit', '--input=body.json'],
      ['api', 'rate_limit', '--hostname', 'example.com'],
      ['api', 'rate_limit', '--hostname=example.com'],
      ['api', 'rate_limit', '-f', 'field=x'],
    ])
      expect(await runGh(args, { ...base, priority: 'poll' })).toMatchObject({
        code: 75,
        deferred: true,
      });
    expect(calls).toBe(4);
  });

  it('still honors secondary-limit breakers for free quota reads', async () => {
    const clock = new FakeClock();
    const store = new MemoryLedgerStore();
    let calls = 0;
    const base = {
      store,
      credential: 'limited-probe',
      now: clock.read,
      sleep: clock.sleep,
      log: quiet,
      maxWaitMs: 0,
      run: async () => {
        calls += 1;
        return {
          code: 1,
          stdout: '',
          stderr: 'gh: secondary rate limit (HTTP 429)',
        };
      },
    };
    expect(
      await runGh(['api', 'rate_limit'], { ...base, priority: 'poll' })
    ).toMatchObject({ code: 75, deferred: true });
    expect(
      await runGh(['api', 'rate_limit'], { ...base, priority: 'poll' })
    ).toMatchObject({ code: 75, deferred: true });
    expect(calls).toBe(1);
  });

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

  it('detects artifact zip endpoints that need file stdout', () => {
    expect(
      ghWantsFileStdout(['api', 'repos/JovieInc/Jovie/actions/artifacts/1/zip'])
    ).toBe(true);
    expect(
      ghWantsFileStdout(['api', 'repos/JovieInc/Jovie/actions/artifacts/1'])
    ).toBe(false);
    expect(ghWantsFileStdout(['api', 'repos/o/r/compare/a...b'])).toBe(false);
  });

  it('skips --include and GH_FORCE_TTY for artifact zip downloads', async () => {
    const seen: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    const run: GhRunner = async (args, env) => {
      seen.push({ args: [...args], env: { ...env } });
      return { code: 0, stdout: zip, stderr: '' };
    };
    const result = await runGh(['api', 'repos/o/r/actions/artifacts/9/zip'], {
      store: new MemoryLedgerStore(),
      credential: 'zip',
      run,
      log: quiet,
      env: { GH_FORCE_TTY: '0', GH_TOKEN: 't' },
    });
    expect(result.code).toBe(0);
    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(result.stdout).toEqual(zip);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.args).toEqual(['api', 'repos/o/r/actions/artifacts/9/zip']);
    expect(seen[0]?.env.GH_FORCE_TTY).toBeUndefined();
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
