// Executable background-build wait protocol used by the Lighthouse workflow.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd(), '../..');

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

  it('passes only when a wrapper with a real child publishes an atomic zero status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    // Mirrors the real launcher: a wrapper with a real child that publishes
    // the child's exit status (atomically) only after the child exits.
    const builder = startBuilder(
      `sleep 1 & child=\$!; wait \$child; status=\$?; printf 'started\n' > '${logFile}'; printf '%s' "\$status" > '${exitFile}.tmp'; mv '${exitFile}.tmp' '${exitFile}'`
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

  it('fails closed on a nonzero child status published by the wrapper', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    const builder = startBuilder(
      `bash -c 'sleep 1; exit 3' & child=\$!; wait \$child; status=\$?; printf 'boom\n' > '${logFile}'; printf '%s' "\$status" > '${exitFile}.tmp'; mv '${exitFile}.tmp' '${exitFile}'`
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

  it('times out, kills the whole build process group, and fails closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-bg-build-'));
    const exitFile = join(dir, 'build.exit');
    const logFile = join(dir, 'build.log');
    const childPidFile = join(dir, 'child.pid');
    // setsid mirrors the real launcher: the wrapper leads its own process
    // group with a real grandchild, so the timeout path must kill the group
    // — killing only the wrapper pid would leak the grandchild.
    const child = spawn(
      'setsid',
      ['bash', '-c', `sleep 300 & echo \$! > '${childPidFile}'; wait`],
      { stdio: 'ignore' }
    );
    if (typeof child.pid !== 'number') throw new Error('builder had no pid');
    const reaped = new Promise<void>(resolve => {
      child.on('exit', () => resolve());
    });
    try {
      const result = runWait(String(child.pid), exitFile, logFile, {
        NEXT_BUILD_WAIT_TIMEOUT_SECONDS: '2',
        NEXT_BUILD_WAIT_TERM_SECONDS: '2',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('did not finish within 2s');
      expect(result.stderr).toContain('process group');
      // The wrapper itself must be dead and reaped.
      await reaped;
      // And the grandchild too: a zombie or missing /proc entry is dead;
      // a live S/R state means the group kill leaked it.
      const grandchildPid = Number(readFileSync(childPidFile, 'utf8').trim());
      expect(Number.isInteger(grandchildPid)).toBe(true);
      let grandchildDead = false;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        let state: string | null = null;
        try {
          const stat = readFileSync(`/proc/${grandchildPid}/stat`, 'utf8');
          state = stat.split(') ')[1]?.split(' ')[0] ?? null;
        } catch {
          state = null; // pid gone entirely
        }
        if (state === null || state === 'Z') {
          grandchildDead = true;
          break;
        }
        spawnSync('sleep', ['0.2']);
      }
      expect(grandchildDead).toBe(true);
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

  it('dashboard job overlaps the fallback compile with setup and waits before probes', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8'
    );
    const start = source.indexOf('  ci-lighthouse-dashboard-pr:');
    const end = source.indexOf('\n  ci-lighthouse-onboarding-pr:');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const job = source.slice(start, end);
    const at = (label: string) => {
      const index = job.indexOf(label);
      expect(index, label).toBeGreaterThan(-1);
      return index;
    };
    const order = [
      'uses: ./.github/actions/setup-node-pnpm',
      'Restore Next build cache for Lighthouse (read-only)',
      'Build base commit for relative Lighthouse budgets',
      'Restore workspace to the exact head',
      'Start fallback build in background',
      'Run background-build helper contract tests',
      'Setup Playwright (Chromium)',
      'Create ephemeral Neon database branch (with retry)',
      'Run migrations (ephemeral Neon)',
      'Wait for background fallback build',
      'Run signed-in shell navigation',
      'tests/e2e/chat-history-switcher.spec.ts',
      'Run signed-in Lighthouse budgets',
      'Kill background build process group (if still alive)',
      'Cleanup ephemeral Neon branch',
    ];
    let previous = -1;
    for (const label of order) {
      const index = at(label);
      expect(index, label).toBeGreaterThan(previous);
      previous = index;
    }
    expect(job).toContain('bash scripts/ci/wait-background-build.sh');
    expect(job).not.toContain('Build app fallback for dashboard Lighthouse');
    expect(job).toContain('actions/cache/restore@');
    expect(job).not.toContain('actions/cache/save@');
  });
});
