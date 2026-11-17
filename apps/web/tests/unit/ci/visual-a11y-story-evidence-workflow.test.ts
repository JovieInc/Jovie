import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

// Companion to visual-a11y-workflow.test.ts (kept under its size cap): the
// story-capture producer job that feeds the component certificate's visual
// and a11y criteria, read as parsed YAML and executed with stubbed tools.

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
};
type Job = {
  'runs-on'?: unknown;
  'timeout-minutes'?: unknown;
  if?: string;
  needs?: unknown;
  steps: Step[];
};
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const loadWorkflow = (name: string) =>
  parseYaml(
    readFileSync(resolve(repoRoot, '.github/workflows', name), 'utf8')
  ) as Workflow;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function step(owner: Job, name: string) {
  const index = owner.steps.findIndex(entry => entry.name === name);
  expect(index, `missing step ${name}`).toBeGreaterThanOrEqual(0);
  return { index, step: owner.steps[index] as Step };
}

// Runs a step's shell in a temp workspace with stub tools on PATH; each stub
// appends its argv to calls.log.
function runStep(
  run: string,
  stubs: Record<string, string>,
  env: Record<string, string> = {}
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-step-')));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [tool, body] of Object.entries(stubs))
    writeFileSync(
      join(bin, tool),
      `#!/bin/bash\necho "${tool} $*" >> "${root}/calls.log"\n${body}\n`,
      { mode: 0o755 }
    );
  const result = spawnSync('bash', ['-c', run], {
    cwd: root,
    encoding: 'utf8',
    env: {
      NODE_ENV: 'test',
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: root,
      RUNNER_TEMP: root,
      GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
      ...env,
    },
  });
  const calls = existsSync(join(root, 'calls.log'))
    ? readFileSync(join(root, 'calls.log'), 'utf8')
    : '';
  return { ...result, calls, root };
}

async function withLiveServer(
  run: (pid: string, exited: Promise<unknown[]>) => Promise<void>
) {
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  const exited = once(child, 'exit');
  try {
    await once(child, 'spawn');
    await run(String(child.pid), exited);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
}

// The 'Report run budget' step reads the shell clock ($(date +%s)). Node's
// Date.now() moves under shift-clock.mjs and the shell clock does not, so a
// STARTED derived from Date.now() becomes a day in the future for bash and
// the over-budget branch can never fire.
function shellEpochSeconds(): number {
  const result = spawnSync('date', ['+%s'], { encoding: 'utf8' });
  const epoch = Number(String(result.stdout).trim());
  if (result.status !== 0 || !Number.isSafeInteger(epoch)) {
    throw new Error(
      `date +%s failed: ${result.stderr || result.stdout || result.status}`
    );
  }
  return epoch;
}

describe('component story evidence producer lane (visual-a11y.yml)', () => {
  const visualA11y = loadWorkflow('visual-a11y.yml');
  const plan = visualA11y.jobs['story-evidence-plan'] as Job;
  const capture = visualA11y.jobs['story-evidence-capture'] as Job & {
    strategy?: { 'fail-fast'?: boolean; matrix?: { shard?: unknown } };
    env?: Record<string, unknown>;
  };
  const evidence = visualA11y.jobs['component-story-evidence'] as Job & {
    name?: string;
    env?: Record<string, unknown>;
  };
  const lane = { plan, capture, evidence } as Record<
    string,
    Job & { env?: Record<string, unknown> }
  >;

  it('plans, shards and merges on hosted runners off the path gate, never gem', () => {
    for (const [id, job] of Object.entries(lane)) {
      expect(job, `missing ${id} job`).toBeDefined();
      expect(job['runs-on']).toBe('ubuntu-24.04');
      expect(JSON.stringify(job)).not.toMatch(
        /self-hosted|jovie-fixed|CI_FAST_RUNNER|CI_UNIT_RUNNER|secrets\./
      );
      // The profile is part of every render binding, so all three agree.
      expect(job.env?.CI).toBe(true);
      expect(job.env?.JOVIE_STORYBOOK_MANUAL_AXE).toBe('1');
    }
    expect(plan.needs).toEqual(['ci-visual-path-changes']);
    expect(plan.if).toContain('has_render_changes');
    expect(plan['timeout-minutes']).toBe(10);
    expect(capture.needs).toEqual(['story-evidence-plan']);
    expect(capture.if).toContain("shards != '0'");
    expect(capture.strategy?.['fail-fast']).toBe(false);
    expect(String(capture.strategy?.matrix?.shard)).toContain(
      'needs.story-evidence-plan.outputs.matrix'
    );
    expect(capture['timeout-minutes']).toBe(25);
    // The completion verifier keys on this one job name.
    expect(evidence.name).toBe('Component Story Evidence');
    expect(evidence.needs).toEqual([
      'story-evidence-plan',
      'story-evidence-capture',
    ]);
    expect(evidence.if).toContain("story-evidence-capture.result == 'skipped'");
    expect(evidence['timeout-minutes']).toBe(10);
    const a11y = visualA11y.jobs['storybook-a11y'] as Job;
    expect(a11y.if).toContain('has_visual_changes');
    expect(a11y['timeout-minutes']).toBe(10);
    expect(Object.keys(visualA11y.on).sort()).toEqual([
      'push',
      'workflow_dispatch',
    ]);
    expect(visualA11y.jobs['report-scheduled-failure']?.needs).toEqual(
      expect.arrayContaining([
        'story-evidence-plan',
        'story-evidence-capture',
        'component-story-evidence',
      ])
    );
  });

  it('restores the last evidence for reuse and saves the merge under the certificate cache key', () => {
    const restore = step(plan, 'Restore prior story evidence');
    const index = step(plan, 'Build static story index');
    const planned = step(plan, 'Plan shards');
    expect(restore.index).toBeLessThan(index.index);
    expect(index.index).toBeLessThan(planned.index);
    expect(restore.step.uses).toMatch(/^actions\/cache\/restore@[0-9a-f]{40}$/);
    expect(restore.step.with?.path).toBe('~/.local/state/jovie-story-evidence');
    expect(restore.step.with?.['restore-keys']).toBe(
      'component-story-evidence-'
    );
    const start = step(capture, 'Start Storybook dev server');
    const playwright = step(capture, 'Setup Playwright (Chromium)');
    const shard = step(capture, 'Capture story evidence');
    expect(start.index).toBeLessThan(playwright.index);
    expect(playwright.index).toBeLessThan(shard.index);
    const merge = step(evidence, 'Merge story evidence');
    const budget = step(evidence, 'Report run budget');
    const save = step(evidence, 'Save story evidence');
    expect(merge.index).toBeLessThan(budget.index);
    expect(budget.index).toBeLessThan(save.index);
    expect(save.step.uses).toMatch(/^actions\/cache\/save@[0-9a-f]{40}$/);
    expect(save.step.with?.path).toBe('~/.local/state/jovie-story-evidence');
    expect(String(save.step.with?.key)).toMatch(/^component-story-evidence-/);
    const certificate = loadWorkflow('component-certificate.yml').jobs
      .certify as Job;
    const certRestore = step(certificate, 'Restore story evidence').step;
    expect(certRestore.with?.path).toBe(save.step.with?.path);
    expect(certRestore.with?.['restore-keys']).toBe(
      'component-story-evidence-'
    );
  });

  it('writes the plan as job outputs and a summary line', () => {
    const run = String(step(plan, 'Plan shards').step.run);
    const json =
      '{"shards":2,"matrix":[1,2],"capture":30,"reused":1249,"renders":600}';
    const out = runStep(
      run,
      { node: `echo '${json}'` },
      { GITHUB_OUTPUT: 'outputs.txt' }
    );
    expect(out.status, out.stderr).toBe(0);
    expect(out.calls).toContain(
      `node scripts/component-story-evidence.mjs --index ${out.root}/story-plan/index.json --reuse-dir ${out.root}/story-plan/prior --plan 20`
    );
    const outputs = readFileSync(join(out.root, 'outputs.txt'), 'utf8');
    expect(outputs).toContain('matrix=[1,2]');
    expect(outputs).toContain('shards=2');
    expect(outputs).toContain('capture=30');
    expect(readFileSync(join(out.root, 'summary.md'), 'utf8')).toContain(
      '30 components to capture (600 renders) on 2 shards, 1249 reused'
    );
  });

  it('gates each shard on a live Storybook and captures only its part', async () => {
    const run = String(step(capture, 'Capture story evidence').step.run);
    const stubs = { curl: 'exit 0', node: 'echo producer-ok', sleep: 'exit 0' };
    const env = { SHARD: '2', SHARDS: '5' };
    const missing = runStep(run, stubs, env);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('Storybook dev server was not started');

    const dead = runStep(run, stubs, { ...env, STORYBOOK_PID: '999999' });
    expect(dead.status).toBe(1);
    expect(dead.stdout).toContain('::error::Storybook dev server died');
    expect(dead.calls).not.toContain('node ');

    await withLiveServer(async (pid, exited) => {
      const ready = runStep(run, stubs, { ...env, STORYBOOK_PID: pid });
      expect(ready.status, ready.stderr).toBe(0);
      expect(ready.calls).toContain(
        'curl -sf http://localhost:6006/index.json'
      );
      expect(ready.calls).toContain(
        `node scripts/component-story-evidence.mjs --base-url http://localhost:6006 --index ${ready.root}/story-plan/index.json --reuse-dir ${ready.root}/story-plan/prior --shard 2/5 --out-dir ${ready.root}/story-shard`
      );
      expect(ready.calls).not.toContain('--local');
      expect((await exited)[1]).toBe('SIGTERM');
    });

    await withLiveServer(async (pid, exited) => {
      const failed = runStep(
        run,
        { ...stubs, node: 'exit 3' },
        { ...env, STORYBOOK_PID: pid }
      );
      expect(failed.status).toBe(3);
      expect((await exited)[1]).toBe('SIGTERM');
    });
    // Spawns the shipped shell with stub tools several times.
  }, 60_000);

  it('merges every shard with the reused receipts, or the reused alone', () => {
    const run = String(step(evidence, 'Merge story evidence').step.run);
    const none = runStep(run, { node: 'exit 0' }, { CAPTURE: '0' });
    expect(none.status, none.stderr).toBe(0);
    expect(none.calls.trim()).toBe(
      `node scripts/component-story-evidence.mjs --merge --reuse-dir ${none.root}/story/story-plan/prior --expect 0 --out-dir ${none.root}/.local/state/jovie-story-evidence`
    );
    const sharded = runStep(
      `mkdir -p "$RUNNER_TEMP/story/story-shard-1" "$RUNNER_TEMP/story/story-shard-2"\n${run}`,
      { node: 'exit 0' },
      { CAPTURE: '12' }
    );
    expect(sharded.status, sharded.stderr).toBe(0);
    expect(sharded.calls).toContain(
      `--expect 12 --out-dir ${sharded.root}/.local/state/jovie-story-evidence ${sharded.root}/story/story-shard-1 ${sharded.root}/story/story-shard-2`
    );
  });

  it('warns, never fails, when a run is over its budget', () => {
    const run = String(step(evidence, 'Report run budget').step.run);
    const now = shellEpochSeconds();
    const quick = runStep(
      run,
      {},
      { CAPTURE: '40', STARTED: String(now - 60) }
    );
    expect(quick.status, quick.stderr).toBe(0);
    expect(quick.stdout).not.toContain('::warning::');
    const slow = runStep(
      run,
      {},
      { CAPTURE: '40', STARTED: String(now - 600) }
    );
    expect(slow.status, slow.stderr).toBe(0);
    expect(slow.stdout).toContain('over its 6 min budget');
    const cold = runStep(
      run,
      {},
      { CAPTURE: '1279', STARTED: String(now - 600) }
    );
    expect(cold.stdout).not.toContain('::warning::');
    expect(readFileSync(join(cold.root, 'summary.md'), 'utf8')).toContain(
      'budget 15 min'
    );
  });
});
