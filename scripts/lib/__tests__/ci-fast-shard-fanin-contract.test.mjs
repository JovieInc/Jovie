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
import { join, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { LANES_COVERAGE_FLOORS } from '../../ci-fast-lanes.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);

// Frozen post-shard schema (JOV-13072). Do not compare against live
// origin/main: after this lands, main already has fan-ins and the old
// "pre-shard remaining job" shape is gone.
const WORKER_NEEDS = [
  'ci-lockfile-preflight',
  'ci-path-changes',
  'ci-merge-group-admission',
  'ci-merge-group-workspace',
];
const WORKER_IF = `!cancelled() && needs.ci-lockfile-preflight.result == 'success' && needs.ci-path-changes.result == 'success' && (
  github.event_name != 'merge_group' ||
  (
    needs.ci-merge-group-workspace.result == 'success' &&
    needs.ci-merge-group-admission.result == 'success' &&
    needs.ci-merge-group-admission.outputs.admitted == 'true'
  )
)`;
const FANIN_IF = WORKER_IF.replace('!cancelled()', 'always()');
const PAIRS = [
  {
    fanin: 'ci-fast-remaining',
    worker: 'ci-fast-remaining-shards',
    faninName: 'ci-fast (remaining)',
    workerName: 'ci-fast (remaining shard ${{ matrix.shard }}/3)',
    matrix: { shard: [1, 2, 3] },
  },
  {
    fanin: 'ci-fast-structural-lanes',
    worker: 'ci-fast-structural-lanes-shards',
    faninName: 'ci-fast (structural lanes)',
    workerName: 'ci-fast (structural lanes shard ${{ matrix.group }})',
    matrix: { group: ['ab', 'cd'] },
  },
];
const ALLOWED_RUNNERS = new Set([
  JSON.stringify('ubuntu-24.04'),
  JSON.stringify('ubuntu-latest'),
  JSON.stringify([
    'self-hosted',
    'Linux',
    'X64',
    "${{ 'jovie-runner-image-canary' }}",
  ]),
  JSON.stringify(
    "${{ vars.MERGE_GATE_POOL == 'fixed' && fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"jovie-fixed\"]') || 'ubuntu-latest' }}"
  ),
]);
const REMAINING_ONCE = [
  'Restore pinned actionlint downloads',
  'Set up Go for source-pinned actionlint',
  'Run actionlint',
  'Validate CI/release incident prevention contract',
  'Resolve incident-labeled Linear issues for this PR',
  'Post-mortem linkage and frontmatter check',
  'Verify Node and tsx seed-loader compatibility',
  'Select Storybook browser proof',
  'Start ci-fast lanes',
];
const REMAINING_SHARED = [
  'Await ci-fast lanes',
  'Run selected Storybook browser proof',
  'Upload Storybook browser evidence',
];
const STRUCTURAL_DECISION_JOBS = [
  'ci-fast-remaining-shards',
  'ci-fast-structural-lanes-shards',
  'ci-fast-structural-python',
  'ci-fast-structural-web',
];

describe('ci-fast shard fan-in contracts', () => {
  const jobs = /** @type {{ jobs: Record<string, any> }} */ (loadYaml(WORKFLOW)).jobs;
  const script = (job, name) =>
    jobs[job].steps.find(step => step.name === name).run;
  const run = (code, env) =>
    spawnSync('bash', ['-eo', 'pipefail', '-c', code], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });

  it('keeps required names, runner policy, Path Changes identity and a shared structural decision', () => {
    for (const [id, job] of Object.entries(jobs)) {
      if (job['runs-on'] !== undefined)
        expect(ALLOWED_RUNNERS.has(JSON.stringify(job['runs-on'])), id).toBe(
          true
        );
    }
    for (const { fanin, worker, faninName, workerName } of PAIRS) {
      expect(jobs[fanin].name).toBe(faninName);
      expect(jobs[worker].name).toBe(workerName);
      expect(jobs[fanin]['runs-on']).toBe('ubuntu-24.04');
      expect(jobs[worker]['runs-on']).toBe('ubuntu-24.04');
    }
    expect(jobs['ci-path-changes'].name).toBe('Path Changes');
    expect(jobs['ci-path-changes']['runs-on']).toBe('ubuntu-24.04');
    const decision = job =>
      job.steps.find(step => step.id === 'structural').run;
    const shared = decision(jobs[STRUCTURAL_DECISION_JOBS[0]]);
    for (const id of STRUCTURAL_DECISION_JOBS)
      expect(decision(jobs[id]), id).toBe(shared);
  });

  it.each(PAIRS)(
    '$fanin fails closed for failed, cancelled, skipped or missing shard results',
    ({ fanin, worker, matrix }) => {
      const job = jobs[fanin];
      const shard = jobs[worker];
      expect(job.needs).toEqual([...WORKER_NEEDS, worker]);
      expect(job.if).toBe(FANIN_IF);
      expect(shard.if).toBe(WORKER_IF);
      expect(shard.needs).toEqual(WORKER_NEEDS);
      expect(shard.strategy['fail-fast']).toBe(false);
      expect(shard.strategy.matrix).toEqual(matrix);
      const gate = job.steps[0];
      expect(gate.env.SHARDS_RESULT).toBe(`\${{ needs.${worker}.result }}`);
      expect(gate['continue-on-error']).toBeUndefined();
      for (const result of ['success', 'failure', 'cancelled', 'skipped', '']) {
        expect(run(gate.run, { SHARDS_RESULT: result }).status, result).toBe(
          result === 'success' ? 0 : 1
        );
      }
    }
  );

  it('runs every nonstructural remaining command and selected browser proof once', () => {
    const worker = jobs['ci-fast-remaining-shards'];
    for (const name of REMAINING_ONCE) {
      const step = worker.steps.find(step => step.name === name);
      expect(step, name).toBeDefined();
      expect(step.if, name).toContain('matrix.shard == 1');
      expect(
        worker.strategy.matrix.shard.filter(shard => shard === 1)
      ).toHaveLength(1);
    }
    for (const name of REMAINING_SHARED) {
      expect(
        worker.steps.find(step => step.name === name),
        name
      ).toBeDefined();
    }
    const upload = worker.steps.find(
      step => step.name === 'Upload ci-fast lane results'
    );
    expect(upload.with.name).toContain('${{ matrix.shard }}');
  });

  it('requires each exact-run coverage artifact and never tolerates missing evidence', () => {
    const fan = jobs['ci-fast-structural-lanes'];
    const worker = jobs['ci-fast-structural-lanes-shards'];
    const upload = worker.steps.find(
      step => step.name === 'Upload lanes coverage evidence'
    );
    expect(upload.with.name).toBe(
      'lanes-coverage-${{ matrix.group }}-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(upload['continue-on-error']).toBeUndefined();
    for (const group of worker.strategy.matrix.group) {
      const download = fan.steps.find(
        step => step.name === `Download lanes coverage ${group}`
      );
      expect(download.with.name).toBe(
        upload.with.name.replace('${{ matrix.group }}', group)
      );
      expect(download['continue-on-error']).toBeUndefined();
    }
  });

  it('accepts consistent successful or legitimately skipped receipts and rejects partial evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'lanes-fanin-evidence-'));
    try {
      const code = script(
        'ci-fast-structural-lanes',
        'Require complete lanes coverage evidence'
      );
      const output = join(root, 'output');
      const set = (ab, cd, missing) => {
        rmSync(join(root, 'lanes-coverage'), { recursive: true, force: true });
        writeFileSync(output, '');
        for (const [group, status] of [
          ['ab', ab],
          ['cd', cd],
        ]) {
          const dir = join(root, 'lanes-coverage', group);
          mkdirSync(dir, { recursive: true });
          if (status)
            writeFileSync(
              join(dir, 'receipt.json'),
              JSON.stringify({ lanes: [{ id: 'structural', status }] })
            );
          if (status === 'success' && missing !== group)
            writeFileSync(join(dir, `jovie-lanes-${group}.coverage`), 'data');
        }
        return run(code, { RUNNER_TEMP: root, GITHUB_OUTPUT: output });
      };
      expect(set('success', 'success').status).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe('ran=true\n');
      expect(set('skipped', 'skipped').status).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe('ran=false\n');
      for (const values of [
        ['success', 'skipped'],
        ['success', 'failure'],
        ['success', 'cancelled'],
        ['success', ''],
        ['success', 'success', 'ab'],
        ['', ''],
      ]) {
        expect(set(...values).status, values.join(',')).not.toBe(0);
      }
      const collect = script(
        'ci-fast-structural-lanes-shards',
        'Collect lanes coverage evidence'
      );
      // A decision skip needs no runner receipt; a selected suite must supply it.
      expect(
        run(collect, { RUNNER_TEMP: root, GROUP: 'ab', DECISION_SKIP: 'true' })
          .status
      ).toBe(0);
      expect(
        run(collect, { RUNNER_TEMP: root, GROUP: 'ab', DECISION_SKIP: 'false' })
          .status
      ).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('combines both branch maps before all 26 authoritative floors and propagates report failure', () => {
    const root = mkdtempSync(join(tmpdir(), 'lanes-fanin-floors-'));
    try {
      const python = join(root, 'python3');
      writeFileSync(
        python,
        '#!/usr/bin/env node\nconst fs=require("node:fs");fs.appendFileSync(process.env.CALLS,JSON.stringify({args:process.argv.slice(2),coverage:process.env.COVERAGE_FILE})+"\\n");if(process.env.FAIL_FLOOR && process.argv.includes("--fail-under=90"))process.exit(7);\n'
      );
      chmodSync(python, 0o755);
      const code = script(
        'ci-fast-structural-lanes',
        'Combine lanes coverage and enforce all module floors'
      );
      const calls = join(root, 'calls');
      const env = {
        RUNNER_TEMP: root,
        PATH: `${root}:${process.env.PATH}`,
        CALLS: calls,
        FAIL_FLOOR: '',
      };
      expect(run(code, env).status).toBe(0);
      const invoked = readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      expect(invoked).toHaveLength(LANES_COVERAGE_FLOORS.length + 1);
      expect(invoked[0].args).toEqual([
        '-m',
        'coverage',
        'combine',
        `${root}/lanes-coverage/ab/jovie-lanes-ab.coverage`,
        `${root}/lanes-coverage/cd/jovie-lanes-cd.coverage`,
      ]);
      expect(invoked.slice(1).map(call => call.args)).toEqual(
        LANES_COVERAGE_FLOORS.map(({ include, floor }) => [
          '-m',
          'coverage',
          'report',
          `--include=${include}`,
          `--fail-under=${floor}`,
        ])
      );
      for (const call of invoked)
        expect(call.coverage).toBe(`${root}/jovie-lanes.coverage`);
      writeFileSync(calls, '');
      expect(run(code, { ...env, FAIL_FLOOR: '1' }).status).toBe(7);
      const fan = jobs['ci-fast-structural-lanes'];
      for (const name of [
        'Set up Python for combined lanes coverage',
        'Install combined lanes coverage reporter',
        'Combine lanes coverage and enforce all module floors',
      ]) {
        const step = fan.steps.find(step => step.name === name);
        expect(step.if).toBe("steps.coverage.outputs.ran == 'true'");
        expect(step['continue-on-error']).toBeUndefined();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
