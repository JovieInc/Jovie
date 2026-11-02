// @vitest-environment node
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  COMPARISON_POLICY,
  FAILURE_BASE,
  FAILURE_HEAD,
  FAILURE_PARENT,
} from './chat-performance-receipt';
import { runComparison } from './compare-chat-performance';

const child = vi.hoisted(() => ({ execFile: vi.fn(), spawn: vi.fn() }));
vi.mock('node:child_process', () => child);
let directory: string;
let running: string | undefined;
let rejectArtifacts = false;
const flights: NodeJS.ProcessEnv[] = [];
const checkouts = new Map<string, string>();
beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), 'chat-driver-'));
  running = undefined;
  rejectArtifacts = false;
  flights.length = 0;
  checkouts.clear();
  for (const key of ['BASE_FIRST', 'BASE_RETRY', 'HEAD_FIRST', 'HEAD_RETRY'])
    vi.stubEnv(`CHAT_COMPARISON_${key}_DATABASE_URL`, `fixture-${key}`);
  child.execFile.mockImplementation(
    (
      exe: string,
      args: string[],
      options: { cwd: string; env: NodeJS.ProcessEnv },
      done: (error: Error | null, stdout: string) => void
    ) => {
      let value = '';
      let failed = false;
      const env = options.env;
      if (exe === 'git') {
        if (args[0] === 'rev-parse')
          value = args[1].endsWith('^') ? FAILURE_PARENT : 'a'.repeat(40);
        if (args[0] === 'merge-base') value = FAILURE_BASE;
        if (args[0] === 'ls-tree') value = args.join(' ');
        if (args[1] === 'add') {
          checkouts.set(args[3], args[4]);
          const web = resolve(args[3], 'apps/web');
          const standalone = resolve(web, '.next/standalone/apps/web');
          mkdirSync(resolve(standalone, '.next'), { recursive: true });
          mkdirSync(resolve(web, '.next/static'), { recursive: true });
          mkdirSync(resolve(web, 'public'), { recursive: true });
          for (const name of ['.next/BUILD_ID', 'server.js'])
            writeFileSync(resolve(standalone, name), args[4]);
        }
        if (args[1] === 'remove') rmSync(args[3], { recursive: true });
      } else if (exe === 'gh') value = FAILURE_HEAD;
      else if (args.includes('--run')) {
        flights.push(env);
        const binding = JSON.parse(env.CHAT_COMPARISON_BINDING!);
        const attempt = Number(env.CHAT_COMPARISON_ATTEMPT);
        failed = binding.sourceSha === FAILURE_HEAD && attempt === 1;
        writeFileSync(
          resolve(env.CHAT_COMPARISON_OUTPUT!, `attempt-${attempt}.json`),
          JSON.stringify({
            ...binding,
            ...COMPARISON_POLICY,
            attempt,
            browser: '145.0',
            measurementStatus: 'complete',
            budgetStatus: failed ? 'fail' : 'pass',
          })
        );
        if (rejectArtifacts) {
          const producer = resolve(
            env.RUNNER_TEMP!,
            'safe-playwright-producer'
          );
          mkdirSync(producer, { recursive: true });
          writeFileSync(resolve(producer, 'blocked'), '1');
          failed = true;
        }
      }
      done(failed ? new Error('fixture failure') : null, value);
    }
  );
  child.spawn.mockImplementation((_exe, _args, options) => {
    running = checkouts.get(options.cwd);
    const server = new EventEmitter() as ChildProcess;
    Object.defineProperty(server, 'exitCode', { value: null });
    server.kill = () => {
      running = undefined;
      return server.emit('exit', 0);
    };
    return server;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (!running) throw new Error('no listener');
      return {
        ok: true,
        json: async () => ({ buildId: running!.slice(0, 7) }),
      };
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(directory, { recursive: true, force: true });
});
it('replays the entire guarded workload on both exact sources, retains failure and cleans up', async () => {
  const output = resolve(directory, 'receipts');
  await runComparison(output);
  expect(
    flights.map(env => [
      JSON.parse(env.CHAT_COMPARISON_BINDING!).sourceSha,
      env.CHAT_COMPARISON_ATTEMPT,
    ])
  ).toEqual([
    [FAILURE_BASE, '1'],
    [FAILURE_BASE, '2'],
    [FAILURE_HEAD, '1'],
    [FAILURE_HEAD, '2'],
  ]);
  const report = JSON.parse(
    readFileSync(resolve(output, 'comparison.json'), 'utf8')
  );
  expect(report.attempts).toMatchObject([
    { base: 'pass', head: 'fail', causality: 'unknown' },
    { base: 'pass', head: 'pass', causality: 'unknown' },
  ]);
  expect(report.stageTimings.stages.smoke['24h']).toMatchObject({
    n: 4,
    p95: expect.any(Number),
  });
  expect(new Set(flights.map(env => env.DATABASE_URL)).size).toBe(4);
  expect(running).toBeUndefined();
  expect([...checkouts.keys()].every(path => !existsSync(path))).toBe(true);
});
it('rejects guarded output and still reaps the standalone process and checkout', async () => {
  rejectArtifacts = true;
  const output = resolve(directory, 'receipts');
  await expect(runComparison(output)).rejects.toThrow(
    'Artifact guard rejected'
  );
  expect(existsSync(output)).toBe(false);
  expect(running).toBeUndefined();
  expect([...checkouts.keys()].every(path => !existsSync(path))).toBe(true);
});
