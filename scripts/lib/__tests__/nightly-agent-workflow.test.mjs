import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/** @typedef {{ name?: string, id?: string, run?: string, with?: Record<string, unknown>, env?: Record<string, string> }} WorkflowStep */
/** @typedef {{ steps: WorkflowStep[], strategy?: { 'fail-fast': boolean, matrix: { shard: number[] } }, 'timeout-minutes'?: number }} WorkflowJob */

const workflow = /** @type {{ jobs: Record<string, WorkflowJob> }} */ (
  load(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/nightly-testing-agent.yml'
      ),
      'utf8'
    )
  )
);
const report = workflow.jobs.report;
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);

function conclusion(overrides) {
  const results = {
    context: 'success',
    deterministic: 'success',
    'mutation-hotspots': 'success',
    'candidate-validation': 'skipped',
    ...overrides,
  };
  const script = step(report, 'Resolve workflow conclusion').run.replace(
    /\$\{\{\s*needs\.([\w-]+)\.result\s*\}\}/g,
    (_, job) => results[job]
  );
  const root = mkdtempSync(join(tmpdir(), 'nightly-conclusion-'));
  try {
    const output = join(root, 'output');
    const run = spawnSync('bash', ['-e', '-c', script], {
      env: { ...process.env, GITHUB_OUTPUT: output },
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    return readFileSync(output, 'utf8').trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('Nightly Testing Agent evidence flow', () => {
  it('keeps reports with identical filenames in separate artifact directories', () => {
    expect(
      step(report, 'Download agent artifacts').with['merge-multiple']
    ).toBe(false);
  });

  it.each([
    'context',
    'deterministic',
    'mutation-hotspots',
    'candidate-validation',
  ])(
    'preserves %s failure and cancellation in the executed conclusion step',
    job => {
      expect(conclusion({ [job]: 'failure' })).toBe('value=failure');
      expect(conclusion({ [job]: 'cancelled' })).toBe('value=cancelled');
    }
  );

  it('allows deliberately skipped optional lanes with successful executed lanes', () => {
    expect(conclusion({ 'mutation-hotspots': 'skipped' })).toBe(
      'value=success'
    );
    expect(
      conclusion({ deterministic: 'cancelled', 'mutation-hotspots': 'failure' })
    ).toBe('value=failure');
  });

  it('shards the full existing selector without cancelling siblings or raising the budget', () => {
    const unit = workflow.jobs.deterministic;
    expect(unit.strategy['fail-fast']).toBe(false);
    expect(unit.strategy.matrix.shard).toEqual([1, 2, 3, 4]);
    expect(unit['timeout-minutes']).toBe(35);
    expect(step(unit, 'Run unit suite').run).toBe(
      'pnpm --filter=@jovie/web run test --shard ${{ matrix.shard }}/4'
    );
    const junit = step(unit, 'Run unit suite').env.VITEST_JUNIT_OUTPUT_FILE;
    for (const identity of [
      'github.run_id',
      'github.run_attempt',
      'matrix.shard',
    ])
      expect(junit).toContain(identity);
    expect(step(unit, 'Normalize unit telemetry').run).toContain(
      `apps/web/${junit}`
    );
    expect(step(unit, 'Upload deterministic telemetry').with.name).toContain(
      'matrix.shard'
    );
  });

  it.each([false, true])(
    'stages only normalized unit telemetry and rejects leaked output (leak=%s)',
    leak => {
      const root = realpathSync(
        mkdtempSync(join(tmpdir(), 'nightly-artifacts-'))
      );
      const runner = join(root, 'runner');
      const output =
        'apps/web/test-results/nightly-agent/deterministic/normalized-results.json';
      const raw = 'apps/web/test-results/nightly-agent/unit-42-1-4.junit.xml';
      mkdirSync(runner);
      mkdirSync(
        join(root, 'apps/web/test-results/nightly-agent/deterministic'),
        { recursive: true }
      );
      writeFileSync(join(root, raw), '<testsuites tests="1" failures="0"/>');
      const normalize = step(
        workflow.jobs.deterministic,
        'Normalize unit telemetry'
      );
      const guard = resolve(
        import.meta.dirname,
        '../../../.github/scripts/guard-playwright-artifacts.mjs'
      );
      try {
        const result = spawnSync(
          process.execPath,
          [
            guard,
            '--run',
            '--',
            process.execPath,
            '-e',
            `require('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify({schema:'nightly-test-agent.normalized.v1', results:[], note:process.env.LEAK_OUTPUT === 'true' ? process.env.NIGHTLY_FIXTURE_SECRET : 'safe'}))`,
          ],
          {
            cwd: root,
            encoding: 'utf8',
            env: {
              PATH: process.env.PATH,
              GITHUB_WORKSPACE: root,
              RUNNER_TEMP: runner,
              GITHUB_RUN_ID: '42',
              GITHUB_RUN_ATTEMPT: '1',
              GITHUB_JOB: 'deterministic',
              NIGHTLY_FIXTURE_SECRET: 'synthetic-nightly-artifact-sentinel',
              LEAK_OUTPUT: String(leak),
              ...normalize.env,
            },
          }
        );
        const producer = join(runner, 'safe-playwright-producer');
        if (leak) {
          expect(result.status).toBe(1);
          expect(result.stderr).toContain('credential-text');
          expect(existsSync(join(producer, 'blocked'))).toBe(true);
          expect(existsSync(join(producer, 'current'))).toBe(false);
        } else {
          expect(result.status, result.stderr).toBe(0);
          const [binding, stage] = readFileSync(
            join(producer, 'current'),
            'utf8'
          )
            .trim()
            .split('|');
          expect(binding).toBe('42:1:deterministic');
          expect(
            JSON.parse(readFileSync(join(producer, stage, output), 'utf8')).note
          ).toBe('safe');
          expect(existsSync(join(producer, stage, raw))).toBe(false);
          expect(readFileSync(join(root, raw), 'utf8')).toContain('testsuites');
        }
      } finally {
        const writable = directory => {
          chmodSync(directory, 0o700);
          for (const entry of readdirSync(directory, { withFileTypes: true }))
            if (entry.isDirectory()) writable(join(directory, entry.name));
        };
        writable(root);
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it('uploads staged report evidence before minting publication credentials', () => {
    const producerIndex = report.steps.findIndex(
      candidate => candidate.name === 'Publish evidence report and ops status'
    );
    const uploadIndex = report.steps.findIndex(
      candidate => candidate.name === 'Upload final report'
    );
    const tokenIndex = report.steps.findIndex(
      candidate => candidate.id === 'report-token'
    );
    const publishIndex = report.steps.findIndex(
      candidate => candidate.name === 'Open nightly evidence PR'
    );

    expect(producerIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(producerIndex);
    expect(tokenIndex).toBeGreaterThan(uploadIndex);
    expect(publishIndex).toBeGreaterThan(tokenIndex);
    expect(report.steps[producerIndex].run).toContain(
      'guard-playwright-artifacts.mjs --run --'
    );
    const artifactPaths = report.steps[uploadIndex].with.path;
    if (typeof artifactPaths !== 'string')
      throw new TypeError('Nightly report artifact paths must be a string');
    expect(artifactPaths.trim().split('\n')).toEqual([
      'apps/web/test-results/nightly-agent/nightly-report.md',
      'apps/web/test-results/nightly-agent/skill-delta.json',
      'docs/NIGHTLY_TESTING_AGENT_REPORT.md',
      'apps/web/reports/nightly-agent/last-run.json',
    ]);
  });

  it('binds the compact report to the resolved workflow conclusion', () => {
    const resolveIndex = report.steps.findIndex(
      candidate => candidate.id === 'conclusion'
    );
    const emitIndex = report.steps.findIndex(
      candidate => candidate.name === 'Emit compact report and skill delta'
    );
    expect(resolveIndex).toBeLessThan(emitIndex);
    expect(report.steps[emitIndex].run).toContain('--workflow-conclusion');
    expect(report.steps[emitIndex].env.WORKFLOW_CONCLUSION).toBe(
      '${{ steps.conclusion.outputs.value }}'
    );
  });
});
