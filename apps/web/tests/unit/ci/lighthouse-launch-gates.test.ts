// Contracts for the merge-group Lighthouse launch gates in ci.yml: the
// dashboard gate runs signed-in shell navigation without an identity secret;
// the onboarding gate still admits on E2E_CLERK_USER_ID.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { SUITES } from '../../../scripts/lighthouse-relative-gate.mjs';

interface LighthouseStep {
  id?: string;
  uses?: string;
  name?: string;
  if?: string;
  run: string;
  env: Record<string, string>;
  'continue-on-error'?: unknown;
}
interface LighthouseJob {
  steps: LighthouseStep[];
  'continue-on-error'?: unknown;
}
interface SelectOptions {
  download?: string;
  ephemeral?: boolean;
  relevant?: boolean;
  failed?: boolean;
  branch?: string;
  baseline?: boolean;
  started?: string;
}

const REPO_ROOT = resolve(process.cwd(), '../..');

function stepNamed(job: LighthouseJob, name: string): LighthouseStep {
  const step = job.steps.find(candidate => candidate.name === name);
  if (!step) throw new Error(`missing step: ${name}`);
  return step;
}

describe('Lighthouse identity admission', () => {
  const workflow = load(
    readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')
  ) as { jobs: Record<string, LighthouseJob> };
  const selected = (
    step: LighthouseStep | undefined,
    available: string,
    {
      download = 'failure',
      ephemeral = false,
      relevant = true,
      failed = false,
      branch = 'fixture-branch',
      baseline = false,
      started = 'true',
    }: SelectOptions = {}
  ): boolean => {
    const expression = (step?.if ?? 'success()')
      .replace(/\$\{\{|\}\}/g, '')
      .replace(
        /\.(lighthouse-identity|lighthouse-baseline|background-build-start|download-build|neon-branch|ci-path-changes|neon-db)\b/g,
        "['$1']"
      );
    // Actions implicitly applies success() unless the expression explicitly
    // selects a status, such as the always() on evidence and cleanup steps.
    if (failed && !/\b(?:always|success|failure|cancelled)\(/.test(expression))
      return false;
    return runInNewContext(expression, {
      success: () => !failed,
      always: () => true,
      steps: {
        'lighthouse-identity': { outputs: { available } },
        'lighthouse-baseline': { outputs: { built: String(baseline) } },
        'background-build-start': { outputs: { started } },
        check_changes: { outputs: { run_full_ci: String(relevant) } },
        'download-build': { outcome: download },
        'neon-branch': { outputs: { branch_id: branch } },
      },
      needs: {
        'ci-path-changes': { outputs: { run_neon: String(ephemeral) } },
        'neon-db': { result: ephemeral ? 'success' : 'skipped' },
      },
    });
  };

  const PROBE_NAMES = {
    dashboard: 'Run signed-in shell navigation',
    onboarding: 'Run authenticated onboarding Lighthouse',
  } as const;

  it('dashboard: runs without an identity secret and blocks on the shell nav click-through', () => {
    const job = workflow.jobs['ci-lighthouse-dashboard-pr'];
    // The persona bypass seeds its own Better Auth user. Gating on the retired
    // Clerk secret made this merge-group check skip and report green.
    expect(job.steps.some(step => step.id === 'lighthouse-identity')).toBe(
      false
    );
    expect(JSON.stringify(job.steps)).not.toContain('E2E_CLERK_');
    const probe = stepNamed(job, PROBE_NAMES.dashboard);
    expect(selected(probe, 'false')).toBe(true);
    const nav = probe.run.indexOf(
      'tests/e2e/dashboard-click-navigation.spec.ts'
    );
    expect(probe.run).toContain('tests/e2e/shell-nav-click-through.spec.ts');
    expect(probe.run).toContain('tests/e2e/shell-route-health.spec.ts');
    expect(probe.run).toContain(
      'tests/e2e/releases-first-paint-visual.spec.ts'
    );
    const serverReady = probe.run.indexOf('SERVER_READY" = "false"');
    expect(nav).toBeGreaterThan(serverReady);
    expect(probe.run).not.toMatch(
      /click-(?:navigation|through)[^\n]*\|\|\s*true/
    );
    // Lighthouse is its own step after navigation, so a budget miss and a
    // navigation failure are reported under their own names.
    expect(probe.run).not.toContain('test:lighthouse');
    const budgets = stepNamed(job, 'Run signed-in Lighthouse budgets');
    expect(job.steps.indexOf(budgets)).toBeGreaterThan(
      job.steps.indexOf(probe)
    );
    expect(selected(budgets, 'false')).toBe(true);
    expect(selected(budgets, 'false', { failed: true })).toBe(false);
    expect(selected(budgets, 'false', { relevant: false })).toBe(false);
    expect(budgets.run).toContain(
      'node apps/web/scripts/lighthouse-relative-gate.mjs'
    );
    expect(budgets.run).not.toMatch(/\|\|/);
    expect(budgets['continue-on-error']).toBeUndefined();
    expect(budgets.env.BASE_URL).toBe('http://localhost:3000');
    expect(budgets.env.LIGHTHOUSE_BASELINE_SERVER).toBe(
      '${{ steps.lighthouse-baseline.outputs.server }}'
    );
    // Chat and onboarding have no identity-free job of their own, so the
    // dashboard gate holds them to their budgets on the same server.
    expect(SUITES).toEqual([
      { name: 'dashboard', script: 'test:lighthouse:dashboard:pr' },
      { name: 'chat', script: 'test:lighthouse:chat:pr' },
      {
        name: 'onboarding',
        script: 'test:lighthouse:onboarding:pr',
        env: { LIGHTHOUSE_TEST_PERSONA: 'creator' },
      },
    ]);
    expect(probe['continue-on-error']).toBeUndefined();
    expect(job['continue-on-error']).toBeUndefined();
  });

  it('dashboard: a missing baseline cannot fail the job, and nothing runs off the head tree', () => {
    const job = workflow.jobs['ci-lighthouse-dashboard-pr'];
    const names = job.steps.map(step => step.name);
    const baseline = stepNamed(
      job,
      'Build base commit for relative Lighthouse budgets'
    );
    const restore = stepNamed(job, 'Restore workspace to the exact head');
    // The script, not continue-on-error, makes a missing baseline harmless.
    expect(baseline['continue-on-error']).toBeUndefined();
    const dir = mkdtempSync(join(tmpdir(), 'lighthouse-baseline-'));
    try {
      // Not a git checkout: the build cannot even start.
      const output = join(dir, 'output');
      const result = spawnSync(
        'bash',
        [
          join(REPO_ROOT, '.github/scripts/lighthouse-build-baseline.sh'),
          'build',
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            GIT_CEILING_DIRECTORIES: dir,
            RUNNER_TEMP: dir,
            GITHUB_OUTPUT: output,
            BASELINE_DIR: join(dir, 'baseline'),
            BASE_SHA: '',
          },
          encoding: 'utf8',
        }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe('built=false\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(baseline.run).toBe(
      'bash .github/scripts/lighthouse-build-baseline.sh build'
    );
    expect(baseline.env.BASE_SHA).toBe(
      '${{ github.event.merge_group.base_sha }}'
    );
    // The restore is blocking and runs whether or not the base build worked.
    expect(restore['continue-on-error']).toBeUndefined();
    // Not the workspace path: after the base checkout that file is the base
    // commit's, or missing (dispatch run 42967736732 failed there).
    expect(restore.run).toBe(
      'bash "$RUNNER_TEMP/lighthouse-build-baseline.sh" restore'
    );
    expect(restore.if).toBe(baseline.if);
    expect(names.indexOf(restore.name)).toBe(names.indexOf(baseline.name) + 1);
    for (const later of [
      'Extract build artifact',
      'Start fallback build in background',
      'Run signed-in shell navigation',
      'Run signed-in Lighthouse budgets',
    ]) {
      expect(names.indexOf(later), later).toBeGreaterThan(
        names.indexOf(restore.name)
      );
    }
    // Base and head are built by the same command with the same env, so the
    // prebuilt artifact (other env) is not used once a baseline exists.
    const fallback = stepNamed(job, 'Start fallback build in background');
    expect(fallback.run).toContain('pnpm --filter=@jovie/web run build');
    for (const key of Object.keys(fallback.env)) {
      expect(baseline.env[key], key).toBe(fallback.env[key]);
    }
    expect(
      selected(fallback, 'true', { download: 'success', baseline: true })
    ).toBe(true);
    expect(
      selected(stepNamed(job, 'Extract build artifact'), 'true', {
        download: 'success',
        baseline: true,
      })
    ).toBe(false);
    // ...and not fetched either: it is about 1.5 GB and nothing would read it.
    const download = stepNamed(job, 'Download build artifact');
    expect(selected(download, 'true', { baseline: true })).toBe(false);
    expect(selected(download, 'true', { baseline: false })).toBe(true);
    expect(
      selected(fallback, 'true', { download: 'skipped', baseline: true })
    ).toBe(true);
    const script = readFileSync(
      join(REPO_ROOT, '.github/scripts/lighthouse-build-baseline.sh'),
      'utf8'
    );
    expect(script).toContain('pnpm --filter=@jovie/web run build');
  });

  it('dashboard: the baseline builds from a checkout with nothing untracked, then restores head', () => {
    // A clean checkout lists no untracked files outside node_modules. The
    // listing must treat that as empty, not as a failed pipeline.
    const dir = mkdtempSync(join(tmpdir(), 'lighthouse-baseline-clean-'));
    const script = join(
      REPO_ROOT,
      '.github/scripts/lighthouse-build-baseline.sh'
    );
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync(
        'git',
        ['-c', 'user.email=ci@example.com', '-c', 'user.name=ci', ...args],
        { cwd, encoding: 'utf8' }
      );
      expect(result.status, `git ${args.join(' ')}: ${result.stderr}`).toBe(0);
      return result.stdout.trim();
    };
    try {
      const origin = join(dir, 'origin');
      const bin = join(dir, 'bin');
      const temp = join(dir, 'temp');
      for (const path of [join(origin, 'apps/web'), bin, temp]) {
        mkdirSync(path, { recursive: true });
      }
      git(origin, 'init', '-q', '-b', 'main');
      git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
      writeFileSync(join(origin, '.gitignore'), '.next/\nnode_modules/\n');
      writeFileSync(join(origin, 'apps/web/page.txt'), 'base\n');
      git(origin, 'add', '-A');
      git(origin, 'commit', '-q', '-m', 'base');
      const baseSha = git(origin, 'rev-parse', 'HEAD');
      writeFileSync(join(origin, 'apps/web/page.txt'), 'head\n');
      git(origin, 'commit', '-q', '-am', 'head');
      const headSha = git(origin, 'rev-parse', 'HEAD');
      // Stands in for `pnpm --filter=@jovie/web run build`: the "server" is
      // the page of whatever commit is checked out.
      writeFileSync(
        join(bin, 'pnpm'),
        '#!/usr/bin/env bash\nset -e\nmkdir -p apps/web/.next/standalone/apps/web node_modules/dep\ncp apps/web/page.txt apps/web/.next/standalone/apps/web/server.js\n'
      );
      chmodSync(join(bin, 'pnpm'), 0o755);
      const work = join(dir, 'work');
      git(dir, 'clone', '-q', '--depth=1', `file://${origin}`, work);
      expect(
        git(work, 'ls-files', '--others', '--ignored', '--exclude-standard')
      ).toBe('');

      const output = join(dir, 'output');
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: temp,
        GITHUB_OUTPUT: output,
        BASELINE_DIR: join(temp, 'baseline'),
        BASE_SHA: baseSha,
      };
      const run = (mode: string) =>
        spawnSync(
          'bash',
          [
            mode === 'restore'
              ? join(temp, 'lighthouse-build-baseline.sh')
              : script,
            mode,
          ],
          { cwd: work, env, encoding: 'utf8' }
        );

      const build = run('build');
      expect(build.status, build.stdout + build.stderr).toBe(0);
      expect(readFileSync(output, 'utf8')).toContain('built=true\n');
      expect(
        readFileSync(join(temp, 'baseline/apps/web/server.js'), 'utf8')
      ).toBe('base\n');

      const restore = run('restore');
      expect(restore.status, restore.stdout + restore.stderr).toBe(0);
      expect(git(work, 'rev-parse', 'HEAD')).toBe(headSha);
      expect(readFileSync(join(work, 'apps/web/page.txt'), 'utf8')).toBe(
        'head\n'
      );
      expect(existsSync(join(work, 'apps/web/.next/standalone'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dashboard: a change to any Lighthouse config it runs turns its measuring steps on', () => {
    // run_full_ci (from run_dashboard_lighthouse) gates every probe step, so a
    // PR touching only one of these must not skip the measurement and pass.
    const source = readFileSync(
      join(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8'
    );
    const match = source.match(/DASHBOARD_LIGHTHOUSE_PATTERN='([^']+)'/);
    expect(match).not.toBeNull();
    const pattern = new RegExp(match?.[1] ?? '$^');
    for (const path of [
      'apps/web/.lighthouserc.dashboard.pr.json',
      'apps/web/.lighthouserc.chat.pr.json',
      'apps/web/.lighthouserc.onboarding.pr.json',
      'apps/web/scripts/lighthouse-dashboard-auth.cjs',
      'apps/web/scripts/lighthouse-relative-budget.mjs',
      'apps/web/scripts/lighthouse-relative-gate.mjs',
      '.github/scripts/lighthouse-build-baseline.sh',
      '.github/scripts/lighthouse-install-scope.mjs',
      'scripts/ci/wait-background-build.sh',
    ]) {
      expect(pattern.test(path), path).toBe(true);
    }
    expect(pattern.test('apps/web/.lighthouserc.admin.pr.json')).toBe(false);
  });

  for (const surface of ['onboarding'] as const) {
    const job = workflow.jobs[`ci-lighthouse-${surface}-pr`];
    it(`${surface}: missing identity succeeds before any checkout, provisioning or build`, () => {
      const [first] = job.steps;
      if (!first) throw new Error('job has no steps');
      expect(first.id).toBe('lighthouse-identity');
      expect(first.uses).toBeUndefined();
      expect(first.env.E2E_CLERK_USER_ID).toBe(
        '${{ secrets.E2E_CLERK_USER_ID }}'
      );
      const dir = mkdtempSync(join(tmpdir(), 'lighthouse-identity-'));
      try {
        for (const identity of ['', 'fixture-identity']) {
          const output = join(dir, identity ? 'present' : 'absent');
          const result = spawnSync('bash', ['-e', '-c', first.run], {
            env: {
              ...process.env,
              E2E_CLERK_USER_ID: identity,
              GITHUB_OUTPUT: output,
            },
            encoding: 'utf8',
          });
          expect(result.status, result.stderr).toBe(0);
          const available = identity ? 'true' : 'false';
          expect(readFileSync(output, 'utf8')).toBe(`available=${available}\n`);
          expect(result.stdout).not.toContain('fixture-identity');
          if (!identity) {
            expect(result.stdout).toContain(`skipping ${surface} Lighthouse`);
            expect(
              job.steps.slice(1).filter(step => selected(step, available))
            ).toEqual([]);
            // The previous probe's existing missing-identity branch also exits
            // successfully: moving it must not turn the job into SKIPPED/red.
            const probe = stepNamed(job, PROBE_NAMES[surface]);
            const oldEarlyExit = probe.run.slice(
              probe.run.indexOf('if [ -z'),
              probe.run.indexOf('export E2E_USE_TEST_AUTH_BYPASS')
            );
            expect(
              spawnSync('bash', ['-e', '-c', oldEarlyExit], {
                env: { ...process.env, E2E_CLERK_USER_ID: '' },
                encoding: 'utf8',
              }).status
            ).toBe(result.status);
          }
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  for (const surface of ['dashboard', 'onboarding'] as const) {
    const job = workflow.jobs[`ci-lighthouse-${surface}-pr`];
    it(`${surface}: present identity preserves artifact fallback, real probes and failure cleanup`, () => {
      const byName = (name: string) => stepNamed(job, name);
      const fallback = byName(
        surface === 'dashboard'
          ? 'Start fallback build in background'
          : `Build app fallback for ${surface} Lighthouse`
      );
      expect(selected(fallback, 'true')).toBe(true);
      expect(selected(fallback, 'true', { failed: true })).toBe(false);
      expect(selected(fallback, 'true', { download: 'success' })).toBe(false);
      expect(
        selected(byName('Extract build artifact'), 'true', {
          download: 'success',
        })
      ).toBe(true);
      const probe = byName(PROBE_NAMES[surface]);
      expect(selected(probe, 'true')).toBe(true);
      expect(selected(probe, 'true', { failed: true })).toBe(false);
      if (surface !== 'dashboard') {
        expect(probe.run).toContain(`pnpm run test:lighthouse:${surface}:pr`);
      }
      expect(probe.run).toContain('Standalone server');
      expect(probe.run).toContain(
        "trap 'kill $SERVER_PID 2>/dev/null || true' EXIT"
      );
      expect(probe.env.BASE_URL).toBe('http://localhost:3000');
      expect(probe.env.E2E_CLERK_USER_ID).toBe(
        surface === 'dashboard' ? undefined : '${{ secrets.E2E_CLERK_USER_ID }}'
      );
      expect(
        selected(byName(`Upload ${surface} Lighthouse artifacts`), 'true', {
          failed: true,
        })
      ).toBe(true);
      if (surface === 'dashboard') {
        expect(
          selected(
            byName('Create ephemeral Neon database branch (with retry)'),
            'true'
          )
        ).toBe(true);
        expect(
          selected(byName('Cleanup ephemeral Neon branch'), 'true', {
            failed: true,
          })
        ).toBe(true);
        expect(
          selected(byName('Cleanup ephemeral Neon branch'), 'true', {
            failed: true,
            branch: '',
          })
        ).toBe(false);
        expect(byName('Cleanup ephemeral Neon branch').if).toContain(
          "steps.neon-branch.outputs.branch_id != ''"
        );
        expect(selected(probe, 'true', { relevant: false })).toBe(false);
      } else {
        expect(
          selected(byName('Export DATABASE_URL (main — non-DB PR)'), 'true')
        ).toBe(true);
        expect(
          selected(byName('Run migrations (ephemeral Neon)'), 'true', {
            ephemeral: true,
          })
        ).toBe(true);
        expect(
          selected(byName('Export DATABASE_URL (main — non-DB PR)'), 'true', {
            ephemeral: true,
          })
        ).toBe(false);
      }
    });
  }
});
