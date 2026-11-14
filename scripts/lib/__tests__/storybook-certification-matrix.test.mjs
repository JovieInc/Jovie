import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
/** @typedef {{name?: string, run?: string, 'continue-on-error'?: boolean, env?: Record<string, string>}} Step */
const workflow =
  /** @type {{jobs: Record<string, {strategy: {matrix: {shard: string}, 'fail-fast': boolean}, steps: Step[], 'continue-on-error'?: boolean}>}} */ (
    load(readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8'))
  );
const job = workflow.jobs['ci-storybook-surfaces'];
const matrixStep = job.steps.find(
  step => step.name === 'Run surface elevation matrix (Storybook)'
);

function matrixFor(eventName) {
  const expression = job.strategy.matrix.shard.replace(
    /^\$\{\{\s*|\s*\}\}$/g,
    ''
  );
  return runInNewContext(expression, {
    github: { event_name: eventName },
    fromJSON: JSON.parse,
  });
}

function runMatrixMember(shard, exitCode = 0) {
  const root = mkdtempSync(join(tmpdir(), 'storybook-matrix-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  writeFileSync(join(bin, 'curl'), '#!/bin/sh\nexit 0\n');
  writeFileSync(
    join(bin, 'node'),
    '#!/bin/sh\nprintf "CALL:%s\\n" "$*"\nexit "$CHILD_EXIT"\n'
  );
  chmodSync(join(bin, 'curl'), 0o755);
  chmodSync(join(bin, 'node'), 0o755);
  try {
    return spawnSync(
      '/bin/bash',
      [
        '-c',
        `sleep 60 </dev/null >/dev/null 2>&1 &\nexport STORYBOOK_PID=$!\n${matrixStep.run}`,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
          RUNNER_TEMP: root,
          GITHUB_WORKSPACE: root,
          STORYBOOK_SHARD: String(shard),
          CHILD_EXIT: String(exitCode),
        },
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('combined-head Storybook certification deduplication', () => {
  it('runs one certification beside all three browser shards only on merge groups', () => {
    expect(matrixFor('merge_group')).toEqual([1, 2, 3, 'certification']);
    expect(matrixFor('push')).toEqual([1, 2, 3]);
    expect(matrixFor('workflow_dispatch')).toEqual([1, 2, 3]);
    expect(matrixStep.env.STORYBOOK_SHARD).toBe('${{ matrix.shard }}');
    expect(job['continue-on-error']).not.toBe(true);
    expect(matrixStep['continue-on-error']).not.toBe(true);
    expect(job.strategy['fail-fast']).toBe(true);
  });

  it('executes the unchanged certification once without replaying browser tests', () => {
    const result = runMatrixMember('certification');
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const calls = result.stdout
      .split('\n')
      .filter(line => line.startsWith('CALL:'));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(
      '/scripts/component-merge-group-storybook-cert.mjs'
    );
    expect(result.stdout).not.toContain('playwright test');
  }, 40_000);

  it.each([1, 2, 3])(
    'keeps the complete browser spec list in shard %s without repeating certification',
    shard => {
      const result = runMatrixMember(shard);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain(
        'component-merge-group-storybook-cert.mjs'
      );
      expect(result.stdout).toContain(
        '/.github/scripts/guard-playwright-artifacts.mjs --run -- pnpm exec playwright test'
      );
      expect(
        result.stdout.match(/tests\/e2e\/storybook-[\w-]+\.spec\.ts/g)
      ).toHaveLength(22);
      expect(result.stdout).toContain(`--workers=2 --shard=${shard}/3`);
    },
    40_000
  );

  it.each(['certification', 1, 2, 3])(
    'propagates failure from matrix member %s',
    shard => {
      const result = runMatrixMember(shard, 23);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(23);
    },
    40_000
  );
});
