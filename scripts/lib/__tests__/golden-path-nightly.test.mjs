import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  goldenPathFingerprint,
  reportGoldenPathResult,
} from '../../golden-path-nightly-intake.mjs';
import { pollingFindings } from '../ci-schedule-inventory.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const workflow = file =>
  /** @type {any} */ (
    yamlLoad(readFileSync(resolve(repoRoot, '.github/workflows', file), 'utf8'))
  );
const nightly = workflow('golden-path-nightly.yml');
const dispatchJob = nightly.jobs['golden-path'];
const stepNamed = (job, name) => job.steps.find(step => step.name === name);
const reportJob = workflow('ci.yml').jobs['ci-golden-path-report'];

let scratch = '';
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = '';
});

/** Runs a workflow step's shell with a recording `gh` stub on PATH. */
function runStep(step, env = {}) {
  scratch = mkdtempSync(join(tmpdir(), 'golden-path-nightly-'));
  const calls = join(scratch, 'gh-calls');
  writeFileSync(join(scratch, 'gh'), `#!/bin/sh\necho "$*" >> "${calls}"\n`);
  chmodSync(join(scratch, 'gh'), 0o755);
  const result = spawnSync('bash', ['-c', step.run], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: `${scratch}:${process.env.PATH}`,
      HOME: process.env.HOME,
      REPO: 'JovieInc/Jovie',
      ...env,
    },
  });
  let recorded = [];
  try {
    recorded = readFileSync(calls, 'utf8').trim().split('\n');
  } catch {}
  return { result, calls: recorded };
}

describe('Golden Path nightly dispatches and exits (JOV-INV-042)', () => {
  it('dispatches ci.yml once and never waits on the run', () => {
    const { result, calls } = runStep(
      stepNamed(dispatchJob, 'Dispatch the Golden Path lane')
    );
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toEqual([
      'workflow run ci.yml --repo JovieInc/Jovie --ref main',
    ]);
    expect(dispatchJob['timeout-minutes']).toBeLessThanOrEqual(10);
    for (const step of dispatchJob.steps) {
      expect(pollingFindings(step), step.name ?? step.uses).toEqual([]);
    }
  });

  it('reports from the dispatched ci.yml run once the Golden Path job ends', () => {
    expect(reportJob.needs).toEqual(['ci-golden-path']);
    expect(reportJob.if).toContain('always()');
    expect(reportJob.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(reportJob.if).toContain("github.ref == 'refs/heads/main'");
    const step = reportJob.steps.at(-1);
    expect(step.env.GOLDEN_PATH_RESULT).toBe(
      '${{ needs.ci-golden-path.result }}'
    );

    // Execute the step with the job result rendered as a red lane.
    const { result } = runStep(step, {
      GOLDEN_PATH_RESULT: 'failure',
      REMEDIATION_TRIGGERS_DISABLED: 'true',
      RUN_URL: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      MAIN_SHA: 'a'.repeat(40),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'remediation dry-run upsert key=golden-path-nightly fingerprint=golden-path-nightly:failure'
    );
  });

  it('files a missing-lane issue when the dispatch fails and resolves on a green skip', () => {
    const failed = stepNamed(
      dispatchJob,
      'File Linear issue when the dispatch fails'
    );
    expect(failed.if).toContain('failure()');
    expect(failed.env.GOLDEN_PATH_RESULT).toBe('missing');
    const skipped = stepNamed(
      dispatchJob,
      'Resolve Linear issue when main is already green'
    );
    expect(skipped.if).toContain("steps.skip.outputs.skip == 'true'");
    expect(skipped.env.GOLDEN_PATH_RESULT).toBe('success');
  });
});

describe('reportGoldenPathResult', () => {
  const env = { LINEAR_API_KEY: 'key' };

  it('resolves the fingerprinted issue on green', async () => {
    const close = vi.fn(async () => ({ ok: true }));
    const upsert = vi.fn();
    await reportGoldenPathResult(
      { result: 'success', runId: '7' },
      { env, close, upsert }
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: 'golden-path-nightly',
        labelKey: 'golden-path-nightly',
        runId: '7',
      })
    );
  });

  it('upserts a P0 Todo issue keyed by the job result on red', async () => {
    const upsert = vi.fn(async () => ({ ok: true }));
    await reportGoldenPathResult(
      { result: 'skipped', runUrl: 'https://run', mainSha: 'abc' },
      { env, close: vi.fn(), upsert }
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: 'golden-path-nightly:skipped',
        title: 'P0: Golden Path nightly is red (golden-path-nightly:skipped)',
        priority: 1,
        createStateName: 'Todo',
        reopenTerminal: true,
      })
    );
    expect(goldenPathFingerprint('')).toBe('golden-path-nightly:missing');
  });

  it('only logs when remediation triggers are disabled', async () => {
    const upsert = vi.fn();
    const close = vi.fn();
    const outcome = await reportGoldenPathResult(
      { result: 'failure' },
      { env: { REMEDIATION_TRIGGERS_DISABLED: 'true' }, close, upsert }
    );
    expect(outcome).toMatchObject({
      ok: true,
      fingerprint: 'golden-path-nightly:failure',
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
