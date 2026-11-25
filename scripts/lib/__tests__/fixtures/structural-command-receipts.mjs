import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runStructural } from '../../../ci-fast-lanes.mjs';

// Registered by the maintained ci-fast-lanes suite, preserving its size cap
// and the existing structural command inventory.
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
describe('structural command receipts', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['success', 'failure', 'external-stop'])(
    'retains a digest-only complete structural inventory: %s',
    async scenario => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'merge_group');
      vi.stubEnv('CI_PRODUCT_LANES', 'ios,mac,web,operations,cross-product');
      vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
      vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'skip');
      vi.stubEnv('CI_FAST_STRUCTURAL_PYTEST', '');
      vi.stubEnv('CI_FAST_STRUCTURAL_WEB', '');
      vi.stubEnv('CI_FAST_STRUCTURAL_SHARD', '');
      const commands = [];
      const sentinel = 'private-fixture-output-not-for-receipts';
      const run = (execute, stop) => {
        // The runner consumes split modes before nested contracts execute.
        vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'skip');
        return runStructural({
          changedFileList: ['scripts/ci-fast-lanes.mjs'],
          concurrency: 1,
          execute,
          stop,
        });
      };
      const control = await run(command => {
        commands.push(command);
        return { code: 0, output: sentinel };
      });
      let started = 0;
      const result =
        scenario === 'success'
          ? control
          : await run(
              () => ({
                code: ++started === 3 && scenario === 'failure' ? 19 : 0,
                output: sentinel,
              }),
              () => scenario === 'external-stop' && started === 2
            );
      expect(commands).toHaveLength(91);
      const digest = value => createHash('sha256').update(value).digest('hex');
      const catalog = commands.map((command, index) => ({
        index,
        id: digest(command),
      }));
      const receipt = result.commandReceipt;
      expect(receipt.catalogId).toBe(digest(JSON.stringify(catalog)));
      expect(receipt.catalogId).toBe(control.commandReceipt.catalogId);
      expect(receipt.wallMs).toBe(result.wallMs);
      expect(receipt.rows).toHaveLength(commands.length);
      for (const [index, row] of receipt.rows.entries()) {
        const timing = result.timings.find(item => item.index === index);
        expect(row).toEqual(
          timing
            ? {
                index,
                recipe: catalog[index].id,
                status: 'completed',
                durationMs: timing.durationMs,
                exit: timing.code,
              }
            : { index, recipe: catalog[index].id, status: 'unstarted' }
        );
      }
      expect(result.code).toBe(scenario === 'failure' ? 19 : 0);
      expect(Boolean(result.skipped)).toBe(scenario === 'external-stop');
      expect(
        receipt.rows.filter(row => row.status === 'unstarted')
      ).toHaveLength(
        scenario === 'success' ? 0 : scenario === 'failure' ? 88 : 89
      );
      expect(JSON.stringify(receipt)).not.toContain(sentinel);
      expect(JSON.stringify(receipt)).not.toMatch(/pnpm|python|node /u);
    }
  );

  it.each(['not-run', 'missing'])(
    'materializes an explicit %s structural receipt without invented commands',
    state => {
      const directory = mkdtempSync(
        join(tmpdir(), 'jovie-structural-receipt-')
      );
      try {
        const output = join(directory, 'lanes.json');
        const result = spawnSync(
          process.execPath,
          [join(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
          {
            cwd: REPO_ROOT,
            env: {
              ...process.env,
              GITHUB_EVENT_NAME: 'workflow_dispatch',
              CI_FAST_LANE_GROUP: 'remaining',
              CI_FAST_ONLY_STRUCTURAL: 'true',
              CI_FAST_SKIP_STRUCTURAL: state === 'not-run' ? 'true' : 'false',
              CI_FAST_STRUCTURAL_SHARD: 'invalid-shard',
              CI_FAST_LANES_OUT: output,
            },
            encoding: 'utf8',
            timeout: 10000,
          }
        );
        expect(result.status, result.stderr).toBe(state === 'not-run' ? 0 : 1);
        const report = JSON.parse(readFileSync(output, 'utf8'));
        expect(report.lanes).toHaveLength(1);
        expect(report.lanes[0].status).toBe(
          state === 'not-run' ? 'skipped' : 'failure'
        );
        expect(report.lanes[0].structuralCommands).toEqual({
          state,
          catalogId: null,
          rows: [],
        });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it.each(['success', 'failure'])(
    'retains source binding and command rows through the real CLI: %s',
    scenario => {
      const directory = mkdtempSync(
        join(tmpdir(), 'jovie-command-receipt-cli-')
      );
      try {
        const output = join(directory, 'lanes.json');
        for (const command of ['node', 'pnpm', 'bash', 'python3']) {
          writeFileSync(
            join(directory, command),
            `#!/bin/sh
printf 'private-command-output\\n'
${command === 'python3' && scenario === 'failure' ? 'case "$*" in *"-m pytest "*) exit 23;; esac' : ''}
exit 0
`,
            { mode: 0o755 }
          );
        }
        const result = spawnSync(
          process.execPath,
          [join(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
          {
            cwd: REPO_ROOT,
            env: {
              PATH: `${directory}:/usr/bin:/bin`,
              GITHUB_EVENT_NAME: 'workflow_dispatch',
              CI_PRODUCT_LANES: 'operations,web',
              CI_FAST_LANE_GROUP: 'remaining',
              CI_FAST_ONLY_STRUCTURAL: 'true',
              CI_FAST_STRUCTURAL_PYTEST: 'only',
              CI_FAST_LANES_OUT: output,
              GITHUB_RUN_ID: '12345',
              GITHUB_RUN_ATTEMPT: '2',
              GITHUB_SHA: 'a'.repeat(40),
              GITHUB_JOB: 'ci-fast-structural-python',
            },
            encoding: 'utf8',
            timeout: 10000,
          }
        );
        expect(result.status, result.stderr).toBe(
          scenario === 'success' ? 0 : 1
        );
        const report = JSON.parse(readFileSync(output, 'utf8'));
        expect(report.schemaVersion).toBe(2);
        expect(report.setupError).toBeNull();
        expect(report.execution).toEqual({
          runId: '12345',
          runAttempt: '2',
          sha: 'a'.repeat(40),
          eventName: 'workflow_dispatch',
          jobId: 'ci-fast-structural-python',
        });
        expect(report.lanes).toHaveLength(1);
        expect(report.lanes[0].status).toBe(scenario);
        const receipt = report.lanes[0].structuralCommands;
        expect(receipt.rows).toHaveLength(4);
        expect(receipt.catalogId).toMatch(/^[a-f0-9]{64}$/u);
        expect(receipt.rows.filter(row => row.exit === 23).length).toBe(
          scenario === 'success' ? 0 : 2
        );
        expect(JSON.stringify(receipt)).not.toMatch(/pnpm|python|private-/u);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
