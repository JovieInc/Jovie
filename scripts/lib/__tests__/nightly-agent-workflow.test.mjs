import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const workflow = load(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../.github/workflows/nightly-testing-agent.yml'
    ),
    'utf8'
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
