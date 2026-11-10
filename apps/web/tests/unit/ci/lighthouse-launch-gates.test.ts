// Contracts for the merge-group Lighthouse launch gates in ci.yml: the
// dashboard gate runs signed-in shell navigation without an identity secret;
// the onboarding gate still admits on E2E_CLERK_USER_ID.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

interface LighthouseStep {
  id?: string;
  uses?: string;
  name?: string;
  if?: string;
  run: string;
  env: Record<string, string>;
  with?: Record<string, unknown>;
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
      started = 'true',
    }: SelectOptions = {}
  ): boolean => {
    const expression = (step?.if ?? 'success()')
      .replace(/\$\{\{|\}\}/g, '')
      .replace(
        /\.(lighthouse-identity|download-build|neon-branch|ci-path-changes|neon-db|background-build-start)\b/g,
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
        check_changes: { outputs: { run_full_ci: String(relevant) } },
        'download-build': { outcome: download },
        'neon-branch': { outputs: { branch_id: branch } },
        'background-build-start': { outputs: { started } },
      },
      needs: {
        'ci-path-changes': { outputs: { run_neon: String(ephemeral) } },
        'neon-db': { result: ephemeral ? 'success' : 'skipped' },
      },
    });
  };

  const PROBE_NAMES = {
    dashboard: 'Run signed-in shell navigation and dashboard Lighthouse',
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
    const lighthouse = probe.run.indexOf(
      'pnpm run test:lighthouse:dashboard:pr'
    );
    const serverReady = probe.run.indexOf('SERVER_READY" = "false"');
    expect(nav).toBeGreaterThan(serverReady);
    expect(lighthouse).toBeGreaterThan(nav);
    // Chat and onboarding have no identity-free job of their own, so the
    // dashboard gate holds them to their budgets on the same server.
    const chat = probe.run.indexOf('pnpm run test:lighthouse:chat:pr');
    const onboarding = probe.run.indexOf(
      'LIGHTHOUSE_TEST_PERSONA=creator pnpm run test:lighthouse:onboarding:pr'
    );
    expect(chat).toBeGreaterThan(lighthouse);
    expect(onboarding).toBeGreaterThan(lighthouse);
    expect(probe.run).not.toMatch(/test:lighthouse:[a-z]+:pr[^\n]*\|\|\s*true/);
    expect(probe.run).not.toMatch(
      /click-(?:navigation|through)[^\n]*\|\|\s*true/
    );
    expect(probe['continue-on-error']).toBeUndefined();
    expect(job['continue-on-error']).toBeUndefined();
  });

  it('dashboard: decides the shared artifact before building; extraction and the background build stay mutually exclusive', () => {
    const job = workflow.jobs['ci-lighthouse-dashboard-pr'];
    const byName = (name: string) => stepNamed(job, name);
    const download = byName('Download build artifact');
    const extract = byName('Extract build artifact');
    const start = byName('Start fallback build in background');
    const wait = byName('Wait for background fallback build');
    // The artifact decision precedes every build path (Move 1, merge-time):
    // ci-build-public is dispatch-only, so on merge_group the download fails
    // and the background build always runs, overlapping Playwright setup,
    // the Neon branch and migrations. When the artifact exists it wins.
    expect(selected(download, 'true')).toBe(true);
    expect(selected(download, 'true', { relevant: false })).toBe(false);
    expect(selected(extract, 'true', { download: 'success' })).toBe(true);
    expect(selected(extract, 'true')).toBe(false);
    expect(selected(start, 'true')).toBe(true);
    expect(selected(start, 'true', { download: 'success' })).toBe(false);
    expect(selected(start, 'true', { relevant: false })).toBe(false);
    // The wait runs exactly when a build was launched (the started output),
    // regardless of why, and no new step may absorb failures.
    expect(selected(wait, 'true')).toBe(true);
    expect(selected(wait, 'true', { started: 'false' })).toBe(false);
    expect(selected(wait, 'true', { relevant: false })).toBe(false);
    expect(wait['continue-on-error']).toBeUndefined();
    expect(start['continue-on-error']).toBeUndefined();
    expect(wait.run).toContain('scripts/ci/wait-background-build.sh');
    // Same read-only Turbopack cache restore as Build + Layout: pinned
    // restore-only action, compiler-state path, hour-suffixed key written
    // only by trusted main (next-build-cache-warm), never saved here — and
    // skipped entirely on the artifact path.
    const cacheHour = byName('Resolve Next build cache hour');
    const cacheRestore = byName('Restore Next build cache (read-only)');
    expect(selected(cacheHour, 'true')).toBe(true);
    expect(selected(cacheHour, 'true', { download: 'success' })).toBe(false);
    expect(selected(cacheRestore, 'true')).toBe(true);
    expect(selected(cacheRestore, 'true', { download: 'success' })).toBe(false);
    expect(selected(cacheRestore, 'true', { relevant: false })).toBe(false);
    expect(cacheRestore.uses).toBe(
      'actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
    );
    expect(cacheRestore.with?.path).toBe('apps/web/.next/cache/turbopack');
    const source = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8'
    );
    expect(source).toContain(
      "key: ${{ runner.os }}-next-build-web-v1-${{ hashFiles('pnpm-lock.yaml', 'apps/web/package.json', 'apps/web/next.config.js') }}-${{ steps.next-build-cache-hour.outputs.hour }}"
    );
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
      // The dashboard job no longer has a synchronous fallback step: the
      // background-build protocol that replaced it is asserted in the
      // artifact-decision test above and executable-tested below.
      if (surface === 'onboarding') {
        const fallback = byName(`Build app fallback for ${surface} Lighthouse`);
        expect(selected(fallback, 'true')).toBe(true);
        expect(selected(fallback, 'true', { failed: true })).toBe(false);
        expect(selected(fallback, 'true', { download: 'success' })).toBe(false);
      } else {
        expect(
          job.steps.some(
            step => step.name === 'Build app fallback for dashboard Lighthouse'
          )
        ).toBe(false);
      }
      expect(
        selected(byName('Extract build artifact'), 'true', {
          download: 'success',
        })
      ).toBe(true);
      const probe = byName(PROBE_NAMES[surface]);
      expect(selected(probe, 'true')).toBe(true);
      expect(selected(probe, 'true', { failed: true })).toBe(false);
      expect(probe.run).toContain(`pnpm run test:lighthouse:${surface}:pr`);
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

describe('dashboard Lighthouse background build wait protocol', () => {
  // Executable tests for scripts/ci/wait-background-build.sh, which the
  // "Wait for background fallback build" ci.yml step invokes. Every
  // abnormal end must exit nonzero; only a written atomic status of 0
  // passes.
  const WAIT_SCRIPT = resolve(REPO_ROOT, 'scripts/ci/wait-background-build.sh');

  interface BuilderFixture {
    pid: number;
    kill: () => void;
  }

  function startBuilder(script: string): BuilderFixture {
    const child = spawn('bash', ['-c', script], { stdio: 'ignore' });
    if (typeof child.pid !== 'number') throw new Error('builder had no pid');
    return {
      pid: child.pid,
      kill: () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // already gone
        }
      },
    };
  }

  function runWait(
    pid: string,
    exitFile: string,
    logFile: string,
    env: Record<string, string> = {}
  ) {
    return spawnSync('bash', [WAIT_SCRIPT, pid, exitFile, logFile], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_BUILD_WAIT_TIMEOUT_SECONDS: '30',
        NEXT_BUILD_WAIT_GRACE_SECONDS: '1',
        ...env,
      },
    });
  }

  it('passes only on an atomic zero status and reports the tail of the log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    const builder = startBuilder(
      `sleep 1; printf 'started\n' > '${logFile}'; printf '%s' 0 > '${exitFile}.tmp'; mv '${exitFile}.tmp' '${exitFile}'`
    );
    try {
      const result = runWait(String(builder.pid), exitFile, logFile);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Background build finished');
      expect(result.stdout).toContain('started');
      expect(readFileSync(exitFile, 'utf8')).toBe('0');
    } finally {
      builder.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed on a nonzero status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    const builder = startBuilder(
      `sleep 1; printf 'boom\n' > '${logFile}'; printf '%s' 3 > '${exitFile}.tmp'; mv '${exitFile}.tmp' '${exitFile}'`
    );
    try {
      const result = runWait(String(builder.pid), exitFile, logFile);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('exit code 3');
      expect(result.stderr).toContain('boom');
    } finally {
      builder.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the builder dies without writing a status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    // Run the builder synchronously so it is fully dead and reaped before
    // the waiter starts: a backgrounded child of this process would linger
    // as a zombie while the waiter blocks, and kill -0 succeeds on zombies.
    const builder = spawnSync('bash', [
      '-c',
      `printf 'halfway\n' > '${logFile}'`,
    ]);
    expect(builder.status).toBe(0);
    expect(typeof builder.pid === 'number' && builder.pid > 0).toBe(true);
    try {
      const result = runWait(String(builder.pid), exitFile, logFile);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('exited without writing');
      expect(result.stderr).toContain('halfway');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed on a non-integer status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    const builder = startBuilder(
      `sleep 1; printf '%s' abc > '${exitFile}.tmp'; mv '${exitFile}.tmp' '${exitFile}'`
    );
    try {
      const result = runWait(String(builder.pid), exitFile, logFile);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('non-integer status');
    } finally {
      builder.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('times out, kills the builder, and fails closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    const child = spawn('bash', ['-c', 'sleep 300'], { stdio: 'ignore' });
    if (typeof child.pid !== 'number') throw new Error('builder had no pid');
    // Resolves once node has reaped the killed builder, which is the real
    // proof it is dead (kill -0 keeps succeeding on an unreaped zombie).
    const reaped = new Promise<void>(resolve => {
      child.on('exit', () => resolve());
    });
    try {
      const result = runWait(String(child.pid), exitFile, logFile, {
        NEXT_BUILD_WAIT_TIMEOUT_SECONDS: '2',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('did not finish within 2s');
      await reaped;
    } finally {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a non-integer pid argument without touching anything', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const result = runWait(
      'not-a-pid',
      join(dir, 'build.exit'),
      join(dir, 'build.log')
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('pid must be an integer');
    rmSync(dir, { recursive: true, force: true });
  });
});
