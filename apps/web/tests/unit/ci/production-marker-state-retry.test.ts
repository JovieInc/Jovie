// Bounded-retry coverage for the production-marker artifact-zip download
// (JOV-6813, 2026-11-16 15:43Z: a transient gh HTTP 503 killed the Sentry
// recurrence dead-man with one attempt). Additive file: the canonical test
// file is pinned large and stays untouched.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const processRunner = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawnSync: processRunner,
  default: { spawnSync: processRunner },
}));

const sha = 'a'.repeat(40);
const repo = 'JovieInc/Jovie';
const testDir = dirname(fileURLToPath(import.meta.url));
const modulePath = resolve(
  testDir,
  '../../../../../.github/scripts/production-marker-state.mjs'
);

type RunnerResult = {
  status: number;
  stdout: string | Buffer;
  stderr: string;
};

/** Scripted gh flow: per-attempt zip outcomes (last one repeats); every other
 * gh endpoint fails deterministically with 'stop-here' so the smoke isolates
 * the zip retry. Returns the zip call count read. */
function mockGhFlow(zipBehaviors: string[]): () => number {
  let zipCalls = 0;
  processRunner.mockImplementation(
    (command: string, args: string[]): RunnerResult => {
      const endpoint = args?.[1] ?? '';
      if (command === 'gh' && endpoint.endsWith('/zip')) {
        zipCalls += 1;
        const behavior =
          zipBehaviors[Math.min(zipCalls - 1, zipBehaviors.length - 1)];
        if (behavior === '503')
          return {
            status: 1,
            stdout: '',
            stderr: 'gh: HTTP 503 Service Unavailable',
          };
        if (behavior === 'hard')
          return { status: 1, stdout: '', stderr: 'producer unavailable' };
        return { status: 0, stdout: Buffer.from('archive'), stderr: '' };
      }
      if (command === 'gh' && endpoint.includes('/artifacts?')) {
        const primary =
          endpoint.includes('name=production-generation-verified-') &&
          !endpoint.includes('-recovery-');
        return {
          status: 0,
          stdout: JSON.stringify({
            total_count: primary ? 1 : 0,
            artifacts: primary
              ? [
                  {
                    id: 9,
                    name: 'production-generation-verified-marker',
                    expired: false,
                    workflow_run: { id: 1 },
                  },
                ]
              : [],
          }),
          stderr: '',
        };
      }
      if (command === 'unzip' && args[0] === '-Z1')
        return {
          status: 0,
          stdout: 'production-generation-verified.json\n',
          stderr: '',
        };
      if (command === 'unzip' && args[0] === '-p')
        return {
          status: 0,
          stdout: JSON.stringify({ controllerRun: 1, controllerAttempt: 1 }),
          stderr: '',
        };
      return { status: 1, stdout: '', stderr: 'stop-here' };
    }
  );
  return () => zipCalls;
}

async function runInspect(): Promise<Record<string, unknown>> {
  const output = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const argv = process.argv;
  try {
    process.argv = [
      process.execPath,
      modulePath,
      '--sha',
      sha,
      '--repo',
      repo,
      '--controller-workflow-id',
      '1',
    ];
    vi.resetModules();
    await import('../../../../../.github/scripts/production-marker-state.mjs');
    return JSON.parse(String(output.mock.calls.at(-1)?.[0]));
  } finally {
    process.argv = argv;
    output.mockRestore();
  }
}

describe('production marker artifact-zip bounded retry', () => {
  afterEach(() => {
    processRunner.mockReset();
    vi.resetModules();
  });

  it('recovers a transient 503 on the next attempt without softening anything', async () => {
    const zipCalls = mockGhFlow(['503', 'ok']);
    // The deterministic stop-here failure proves the flow moved PAST the zip
    // stage; a single-attempt reader would have died on the 503 itself.
    await expect(runInspect()).resolves.toMatchObject({
      state: 'manual',
      reason: 'evidence_api_error',
    });
    expect(zipCalls()).toBe(2);
  });

  it('never retries a deterministic failure', async () => {
    const zipCalls = mockGhFlow(['hard']);
    const result = await runInspect();
    expect(result).toMatchObject({
      state: 'manual',
      reason: 'evidence_api_error',
    });
    expect(zipCalls()).toBe(1);
  });

  it('gives up after the bounded attempts and fails closed on persistent 503s', async () => {
    const zipCalls = mockGhFlow(['503']);
    const result = await runInspect();
    expect(result).toMatchObject({
      state: 'manual',
      reason: 'evidence_api_error',
    });
    // Three attempts total: the two bounded backoffs ran, then the original
    // 503 error stood. No threshold moved, no skip introduced.
    expect(zipCalls()).toBe(3);
    const stderrCalls = processRunner.mock.calls.filter(
      call => call[0] === 'gh' && String(call[1]?.[1] ?? '').endsWith('/zip')
    );
    expect(stderrCalls.length).toBe(3);
  });
});
