import { execFileSync, spawnSync } from 'node:child_process';
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

describe('ci-fast shard fan-in contracts', () => {
  const jobs = loadYaml(WORKFLOW).jobs;
  const baseline = loadYaml(
    execFileSync('git', ['show', 'origin/main:.github/workflows/ci.yml'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
  ).jobs;
  const pairs = [
    ['ci-fast-remaining', 'ci-fast-remaining-shards'],
    ['ci-fast-structural-lanes', 'ci-fast-structural-lanes-shards'],
  ];
  const script = (job, name) =>
    jobs[job].steps.find(step => step.name === name).run;
  const run = (code, env) =>
    spawnSync('bash', ['-eo', 'pipefail', '-c', code], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });

  it('preserves all baseline runner assignments, the Path Changes job and structural decision', () => {
    const labels = new Set(
      Object.values(baseline)
        .filter(job => job['runs-on'])
        .map(job => JSON.stringify(job['runs-on']))
    );
    for (const [id, job] of Object.entries(baseline))
      expect(jobs[id]['runs-on'], id).toEqual(job['runs-on']);
    for (const [id, job] of Object.entries(jobs))
      if (job['runs-on'])
        expect(labels.has(JSON.stringify(job['runs-on'])), id).toBe(true);
    expect(jobs['ci-path-changes']).toEqual(baseline['ci-path-changes']);
    const decision = job =>
      job.steps.find(step => step.id === 'structural').run;
    for (const id of [
      'ci-fast-remaining-shards',
      'ci-fast-structural-lanes-shards',
      'ci-fast-structural-python',
      'ci-fast-structural-web',
    ]) {
      expect(decision(jobs[id]), id).toBe(
        decision(baseline['ci-fast-remaining'])
      );
    }
  });

  it.each(pairs)(
    '%s fails closed for failed, cancelled, skipped or missing shard results',
    (id, worker) => {
      const job = jobs[id];
      expect(job.name).toBe(baseline[id].name);
      expect(job.needs).toEqual([...baseline[id].needs, worker]);
      expect(job.if).toBe(baseline[id].if.replace('!cancelled()', 'always()'));
      expect(jobs[worker].if).toBe(baseline[id].if);
      expect(jobs[worker].needs).toEqual(baseline[id].needs);
      expect(jobs[worker].strategy['fail-fast']).toBe(false);
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
    const old = baseline['ci-fast-remaining'];
    const worker = jobs['ci-fast-remaining-shards'];
    const once = [
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
    for (const name of once) {
      const step = worker.steps.find(step => step.name === name);
      expect(step.run, name).toBe(
        old.steps.find(step => step.name === name).run
      );
      expect(step.if, name).toContain('matrix.shard == 1');
      expect(
        worker.strategy.matrix.shard.filter(shard => shard === 1)
      ).toHaveLength(1);
    }
    for (const name of [
      'Await ci-fast lanes',
      'Run selected Storybook browser proof',
      'Upload Storybook browser evidence',
    ]) {
      const step = worker.steps.find(step => step.name === name);
      expect(step).toEqual(old.steps.find(step => step.name === name));
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
