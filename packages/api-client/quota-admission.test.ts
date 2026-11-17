import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FakeClock } from './fake-provider.ts';
import { ghShape, runGh } from './gh.ts';
import { credentialState } from './policy.ts';
import { FileLedgerStore, MemoryLedgerStore } from './store.ts';

const quiet = () => undefined;

describe('quota admission through the shared gh ledger', () => {
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
});
