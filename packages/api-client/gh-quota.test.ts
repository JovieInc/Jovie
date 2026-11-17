import { describe, expect, it } from 'vitest';
import { ghShape, runGh } from './gh.ts';
import { credentialState } from './policy.ts';
import { MemoryLedgerStore } from './store.ts';

const quiet = () => {};

describe('bounded job-log quota routing', () => {
  it('charges bounded per-job full and failed logs to REST core', () => {
    const expected = {
      resource: 'core',
      write: false,
      idempotent: true,
      cost: 5,
    };
    for (const logFlag of ['--log', '--log-failed']) {
      for (const attempt of [[], ['--attempt', '2']]) {
        const args = ['run', 'view', '--job', '12', ...attempt, logFlag];
        expect(ghShape(args)).toEqual(expected);
        expect(
          ghShape([...args.slice(0, 2), '--repo', 'o/r', ...args.slice(2)])
        ).toEqual(expected);
      }
    }
    for (const args of [
      ['run', 'view', '--repo', 'o/r', '--job', '0', '--log-failed'],
      ['run', 'view', '--repo', 'o/r', '--job', '-1', '--log-failed'],
      ['run', 'view', '--job', '12', '--attempt', '0', '--log-failed'],
      ['run', 'view', '--job', '12', '--attempt', '--log-failed'],
      ['run', 'view', '--job', '12', '--log', '--log-failed'],
      ['run', 'view', '--repo', 'invalid', '--job', '12', '--log-failed'],
      ['run', 'view', '12', '--log-failed'],
      ['run', 'view', '--job', '12'],
      ['pr', 'view', '12'],
    ]) {
      expect(ghShape(args)).toEqual({
        resource: 'graphql',
        write: false,
        idempotent: true,
      });
    }
  });

  it.each([
    [5, 0, 1],
    [4, 100, 0],
    [0, 100, 0],
  ])(
    'admits failed job logs using core=%i independently of graphql=%i',
    async (core, graphql, expectedCalls) => {
      const args = [
        'run',
        'view',
        '--repo',
        'o/r',
        '--job',
        '12',
        '--log-failed',
      ];
      const nowMs = 1_000_000;
      const store = new MemoryLedgerStore();
      const seen: string[][] = [];
      await store.transact('github', ledger => {
        const state = credentialState(ledger, 'c', nowMs);
        for (const [resource, remaining] of Object.entries({ core, graphql })) {
          state.buckets[resource] = {
            limit: null,
            remaining,
            resetAt: nowMs + 60000,
            observedAt: nowMs,
          };
        }
      });
      const result = await runGh(args, {
        priority: 'repair',
        store,
        credential: 'c',
        now: () => nowMs,
        sleep: async () => {
          throw new Error('quota admission must not wait');
        },
        random: () => 0,
        log: quiet,
        maxAttempts: 1,
        maxWaitMs: 0,
        run: async argv => {
          seen.push([...argv]);
          return { code: 0, stdout: 'failed job log', stderr: '' };
        },
      });
      expect(seen).toEqual(expectedCalls ? [args] : []);
      expect(result.code).toBe(expectedCalls ? 0 : 75);
      expect(result.deferred).toBe(!expectedCalls);
      expect(
        await store.transact('github', ledger => ({
          core: ledger.credentials.c?.buckets.core?.remaining,
          graphql: ledger.credentials.c?.buckets.graphql?.remaining,
        }))
      ).toEqual({ core: core - expectedCalls * 5, graphql });
    }
  );
});
