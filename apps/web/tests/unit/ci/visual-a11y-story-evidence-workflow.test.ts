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

describe('component story evidence producer lane (visual-a11y.yml)', () => {
  const visualA11y = loadWorkflow('visual-a11y.yml');
  const evidence = visualA11y.jobs['component-story-evidence'] as Job;

  it('runs on a hosted runner off the path gate, never gem, without raising the a11y lane', () => {
    expect(evidence, 'missing component-story-evidence job').toBeDefined();
    expect(evidence['runs-on']).toBe('ubuntu-24.04');
    expect(JSON.stringify(evidence)).not.toMatch(
      /self-hosted|jovie-fixed|CI_FAST_RUNNER|CI_UNIT_RUNNER|secrets\./
    );
    expect(evidence.needs).toEqual(['ci-visual-path-changes']);
    expect(evidence.if).toContain('has_render_changes');
    expect(evidence['timeout-minutes']).toBe(30);
    const a11y = visualA11y.jobs['storybook-a11y'] as Job;
    expect(a11y.if).toContain('has_visual_changes');
    expect(a11y['timeout-minutes']).toBe(10);
    expect(Object.keys(visualA11y.on).sort()).toEqual([
      'push',
      'workflow_dispatch',
    ]);
    expect(visualA11y.jobs['report-scheduled-failure']?.needs).toContain(
      'component-story-evidence'
    );
  });

  it('boots Storybook, captures, then saves receipts under the certificate cache key', () => {
    const start = step(evidence, 'Start Storybook dev server');
    const playwright = step(evidence, 'Setup Playwright (Chromium)');
    const capture = step(evidence, 'Capture story evidence');
    const save = step(evidence, 'Save story evidence');
    expect([start, playwright, capture, save].map(e => e.index)).toEqual(
      [start.index, playwright.index, capture.index, save.index].sort(
        (a, b) => a - b
      )
    );
    expect(start.step.env?.JOVIE_STORYBOOK_MANUAL_AXE).toBe('1');
    expect(capture.step.env?.JOVIE_STORYBOOK_MANUAL_AXE).toBe('1');
    expect(save.step.uses).toMatch(/^actions\/cache\/save@[0-9a-f]{40}$/);
    expect(save.step.with?.path).toBe('~/.local/state/jovie-story-evidence');
    expect(String(save.step.with?.key)).toMatch(/^component-story-evidence-/);
    const certificate = loadWorkflow('component-certificate.yml').jobs
      .certify as Job;
    const restore = step(certificate, 'Restore story evidence').step;
    expect(restore.with?.path).toBe(save.step.with?.path);
    expect(restore.with?.['restore-keys']).toBe('component-story-evidence-');
  });

  it('gates the producer on a live Storybook and writes to the saved path', async () => {
    const run = String(step(evidence, 'Capture story evidence').step.run);
    const stubs = { curl: 'exit 0', node: 'echo producer-ok', sleep: 'exit 0' };
    const env = {};
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
        `node scripts/component-story-evidence.mjs --base-url http://localhost:6006 --out-dir ${ready.root}/.local/state/jovie-story-evidence`
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
});
