import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const workflow = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/mutation-diff.yml'),
  'utf8'
);

describe('Mutation Diff Gem contract', () => {
  // Policy 2026-10-29 (supersedes 2026-10-26 hosted-by-default): hosted CI is saturated, so every
  // job runs on the Gem jovie-fixed pool. The sweep preflight skips when Gem is short on capacity.
  it('runs every job on the Gem jovie-fixed pool and keeps the sweep state in an Actions cache', () => {
    const runsOn = [...workflow.matchAll(/^\s+runs-on:\s*(.+)$/gmu)].map(
      match => match[1].trim()
    );
    expect(runsOn).toHaveLength(2);
    for (const value of runsOn)
      expect(value).toBe('[self-hosted, Linux, X64, jovie-fixed]');
    expect(workflow).not.toMatch(/runs-on:\s*ubuntu/u);
    expect(workflow).toMatch(/actions\/cache\/restore@/u);
    expect(workflow).toMatch(/actions\/cache\/save@/u);
  });

  it('is gated on 5-minute load below 8 with Stryker concurrency 1', () => {
    expect(workflow).toMatch(/MUTATION_MAX_LOAD: '8'/u);
    expect(workflow).toMatch(/STRYKER_CONCURRENCY: '1'/u);
    expect(workflow).not.toMatch(/MUTATION_MAX_LOAD: '(?!8')/u);
  });

  it('ranks the sweep by touch (tier weight plus churn)', () => {
    expect(workflow).toMatch(/test-quality-loop\.mjs rank/u);
    expect(workflow).toMatch(/--touch-file/u);
  });

  it('confines its one secret to the issue-filing step and never runs on pull requests', () => {
    const secrets = workflow.match(/\$\{\{\s*secrets\.[A-Z_]+/gu) ?? [];
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatch(/LINEAR_API_KEY/u);
    const step = workflow
      .split('- name: File survivor issues')[1]
      .split(/\n {6}- name:/u)[0];
    expect(step).toMatch(/secrets\.LINEAR_API_KEY/u);
    expect(step).toMatch(/mutation-sweep-file-issues\.mjs/u);
    expect(step).not.toMatch(/mutation-sweep\.mjs|stryker|vitest/iu);
    expect(workflow).not.toMatch(/pull_request/u);
  });

  it('is event-driven: no cron, self-chains through workflow_dispatch only', () => {
    expect(workflow).not.toMatch(/^\s*schedule:/mu);
    expect(workflow).toMatch(
      /cli\.ts gh --priority default -- workflow run mutation-diff\.yml --ref main/u
    );
    expect(workflow).toContain('actions: write');
  });

  it('sweeps trusted main only and serializes on one group', () => {
    const sweep = workflow.slice(workflow.indexOf('\n  sweep:'));
    expect(sweep).toContain("github.ref == 'refs/heads/main'");
    expect(sweep).toMatch(/ref: main\n\s+persist-credentials: false/u);
    expect(sweep).toContain('group: mutation-sweep');
    expect(sweep).toContain('cancel-in-progress: false');
    expect(sweep).toContain('scripts/mutation-sweep-preflight.mjs');
  });
});

const { load } = createRequire(import.meta.url)('js-yaml');
const steps = load(
  readFileSync(
    resolve(REPO_ROOT, '.github/workflows/component-certificate.yml'),
    'utf8'
  )
).jobs.certify.steps;
const fixtureRoots = [];
afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('diff mutation capacity admission', () => {
  it.each([
    [0, 0, 0, true, true, 0],
    [75, 0, 0, false, false, 0],
    [23, 0, 23, false, false, 0],
    [0, 75, 0, true, false, 0],
    [0, 23, 23, true, false, 0],
    [0, 0, 1, true, true, 1],
    [0, 0, 0, false, false, 0, false],
  ])(
    'preflight %i then %i: exits %i, setup=%s, score=%s',
    (earlyStatus, lateStatus, expectedStatus, setupExpected, scoreExpected, mutationStatus, hasFiles = true) => {
      const diff = load(workflow).jobs.mutate.steps;
      const capacity = diff.find(step => step.id === 'capacity');
      const setup = diff.find(step => step.name === 'Setup Node.js and pnpm');
      const mutation = diff.find(step => step.id === 'mutation');
      const upload = diff.find(step => step.name === 'Upload mutation reports');
      expect(
        capacity,
        'capacity must be checked before dependency setup'
      ).toBeDefined();
      expect(diff.indexOf(capacity)).toBeLessThan(diff.indexOf(setup));
      expect(capacity.if).toBe("steps.files.outputs.files != ''");
      expect(capacity.env.MUTATION_MAX_LOAD).toBe('8');
      expect(mutation.env.MUTATION_MAX_LOAD).toBe('8');
      expect(upload.if).toContain("steps.mutation.outputs.started == 'true'");
      expect(upload.if).toContain('always()');

      const root = mkdtempSync(resolve(tmpdir(), 'mutation-capacity-'));
      fixtureRoots.push(root);
      mkdirSync(resolve(root, 'scripts'));
      const reportPath = resolve(
        root,
        'apps/web/reports/mutation/diff/report.json'
      );
      mkdirSync(resolve(root, 'apps/web/reports/mutation/diff'), {
        recursive: true,
      });
      writeFileSync(reportPath, '{"stale":true}');
      writeFileSync(
        resolve(root, 'scripts/mutation-sweep-preflight.mjs'),
        'process.exit(Number(process.env.PREFLIGHT_STATUS));\n'
      );
      writeFileSync(
        resolve(root, 'scripts/mutation-diff.mjs'),
        "import { writeFileSync, appendFileSync } from 'node:fs'; writeFileSync('scored', 'yes'); writeFileSync('apps/web/reports/mutation/diff/report.json', '{\"fresh\":true}'); appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'score: measured\\n'); process.exit(Number(process.env.MUTATION_STATUS));\n"
      );
      const summary = resolve(root, 'summary');
      const output = resolve(root, 'output');
      writeFileSync(summary, '');
      writeFileSync(output, '');
      const outputs = {
        files: { files: hasFiles ? 'apps/web/lib/auth/example.ts' : '' },
      };
      const admitted = step =>
        step.if
          .replace(/^\$\{\{\s*(.*?)\s*\}\}$/u, '$1')
          .split(' && ')
          .every(condition => {
            switch (condition) {
              case 'always()':
                return true;
              case "hashFiles('apps/web/reports/mutation/diff/*.json') != ''":
                return existsSync(reportPath);
              case "steps.files.outputs.files != ''":
                return outputs.files.files !== '';
              case "steps.capacity.outputs.run == 'true'":
                return outputs.capacity?.run === 'true';
              case "steps.mutation.outputs.started == 'true'":
                return outputs.mutation?.started === 'true';
              default:
                throw new Error(`unsupported step condition: ${condition}`);
            }
          });
      const run = (step, status) =>
        spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            ...step.env,
            PREFLIGHT_STATUS: String(status),
            MUTATION_STATUS: String(mutationStatus),
            GITHUB_OUTPUT: output,
            GITHUB_STEP_SUMMARY: summary,
          },
        });
      expect(admitted(capacity)).toBe(hasFiles);
      let status = admitted(capacity) ? run(capacity, earlyStatus).status : 0;
      outputs.capacity = Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(row => row.split('='))
      );
      const setupRan = status === 0 && admitted(setup);
      if (setupRan) writeFileSync(resolve(root, 'setup'), 'yes');
      if (status === 0 && admitted(mutation))
        status = run(mutation, lateStatus).status;
      expect(status).toBe(expectedStatus);
      expect(existsSync(resolve(root, 'setup'))).toBe(setupExpected);
      expect(existsSync(resolve(root, 'scored'))).toBe(scoreExpected);
      const receipt = readFileSync(output, 'utf8');
      outputs.mutation = Object.fromEntries(
        receipt
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(row => row.split('='))
      );
      // A pre-existing report is insufficient. A failing harness may upload its
      // fresh report because the upload step uses always() and the start receipt.
      expect(admitted(upload)).toBe(scoreExpected);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual(
        scoreExpected ? { fresh: true } : { stale: true }
      );
      const report = readFileSync(summary, 'utf8');
      expect(receipt.includes('started=true')).toBe(scoreExpected);
      expect(report.includes('score: measured')).toBe(scoreExpected);
      if (earlyStatus === 75 || lateStatus === 75)
        expect(report).toContain('no mutation score produced');
      if (expectedStatus !== 0) expect(report).not.toContain('Skipped');
    }
  );
});

describe('portable mutation evidence', () => {
  it('archives relative to the checkout and restores identical scores across runner homes', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'certificate-cache-'));
    fixtureRoots.push(root);
    const producer = load(
      readFileSync(
        resolve(REPO_ROOT, '.github/workflows/mutation-diff.yml'),
        'utf8'
      )
    ).jobs.sweep.steps;
    const stage = producer.find(
      step => step.name === 'Stage portable sweep state'
    );
    const save = producer.find(step => step.name === 'Save sweep state');
    const restore = steps.find(
      step => step.name === 'Restore mutation evidence'
    );
    const producerRestore = producer.find(
      step => step.name === 'Restore sweep state'
    );
    expect(save.with.path).toBe(restore.with.path);
    expect(save.with.path).toBe(producerRestore.with.path);
    expect(save.with.key).toBe(restore.with.key);
    expect(producerRestore.with['restore-keys'].trim()).toBe(
      restore.with['restore-keys']
    );
    expect(restore.with['restore-keys']).not.toBe('mutation-sweep-state-');
    const home = resolve(root, 'producer-home');
    const workspace = resolve(root, 'producer-workspace');
    const target = resolve(root, 'consumer-workspace');
    const stateDir = resolve(home, '.local/state/jovie-mutation');
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(workspace);
    mkdirSync(target);
    const state = JSON.stringify({
      schemaVersion: 1,
      modules: {
        'packages/ui/atoms/badge.tsx': {
          blob: 'source-and-test-key',
          sha: 'measured-sha',
          score: 82,
          valid: 11,
        },
      },
    });
    writeFileSync(resolve(stateDir, 'sweep-state.json'), state);
    const history = '{"durationMs":42}\n';
    writeFileSync(resolve(stateDir, 'sweep-state.json.runs.jsonl'), history);
    const run = (command, args, cwd, env = process.env) => {
      const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return result.stdout;
    };
    run('bash', ['-c', stage.run], workspace, { ...process.env, HOME: home });
    const archive = resolve(root, 'cache.tar');
    run('tar', ['-cf', archive, save.with.path], workspace);
    const entries = run('tar', ['-tf', archive], workspace).trim().split('\n');
    expect(
      entries.every(path => path.startsWith('.cache/jovie-mutation/'))
    ).toBe(true);
    expect(
      entries.some(path => path.includes('..') || path.includes(home))
    ).toBe(false);
    run('tar', ['-xf', archive], target);
    expect(
      readFileSync(
        resolve(target, restore.with.path, 'sweep-state.json'),
        'utf8'
      )
    ).toBe(state);
    expect(readFileSync(resolve(stateDir, 'sweep-state.json'), 'utf8')).toBe(
      state
    );
    expect(
      readFileSync(
        resolve(target, restore.with.path, 'sweep-state.json.runs.jsonl'),
        'utf8'
      )
    ).toBe(history);
    // An older local HOME must not replace the restored CI cache.
    writeFileSync(
      resolve(stateDir, 'sweep-state.json'),
      '{"older":"local-result"}'
    );
    run('bash', ['-c', stage.run], target, { ...process.env, HOME: home });
    expect(
      readFileSync(
        resolve(target, restore.with.path, 'sweep-state.json'),
        'utf8'
      )
    ).toBe(state);
    expect(
      producer.find(step => step.name === 'Score the next modules').run
    ).toContain('state_dir=".cache/jovie-mutation"');
    expect(stage.run).toContain('flock -n 9');
    expect(save.if).toContain("steps.portable_state.outcome == 'success'");
    expect(save.if).toContain(
      "hashFiles('.cache/jovie-mutation/sweep-state.json')"
    );
  });
});
