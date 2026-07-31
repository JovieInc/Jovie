import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateLockRecovery,
  formatRecoveryLogLine,
  normalizePid,
} from '../typecheck-singleflight-lock.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const wrapper = resolve(repoRoot, 'scripts/typecheck-singleflight.mjs');
const temporaryDirectories = [];
const childProcesses = [];

afterEach(() => {
  for (const child of childProcesses.splice(0)) {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeStateDir() {
  const stateDir = mkdtempSync(resolve(tmpdir(), 'jovie-singleflight-'));
  temporaryDirectories.push(stateDir);
  return stateDir;
}

function wrapperEnv(stateDir, overrides = {}) {
  return {
    ...process.env,
    TYPECHECK_SINGLEFLIGHT_DIR: stateDir,
    TYPECHECK_SINGLEFLIGHT_POLL_MS: '25',
    TYPECHECK_SINGLEFLIGHT_STALE_MS: '100',
    TYPECHECK_SINGLEFLIGHT_REUSE_WINDOW_MS: '5000',
    ...overrides,
  };
}

function ownerScript(durationMs) {
  // Track concurrent live owners so we can prove singleflight serialization
  // independently of completed-result reuse (commands/fingerprints differ by
  // argv paths across helper variants).
  return (
    "const fs=require('node:fs');" +
    'const marker=process.argv[1];' +
    'const active=process.argv[2];' +
    "const n=Number(fs.readFileSync(active,'utf8')||'0')+1;" +
    'fs.writeFileSync(active,String(n));' +
    "fs.appendFileSync(marker,'owner concurrent='+n+'\\n');" +
    `setTimeout(()=>{` +
    "const m=Number(fs.readFileSync(active,'utf8'))-1;" +
    'fs.writeFileSync(active,String(m));' +
    'process.exit(0);' +
    `},${durationMs});`
  );
}

function runWrapper(stateDir, marker, options = {}) {
  const durationMs = options.durationMs ?? 700;
  const active = resolve(stateDir, 'active.txt');
  if (!existsSync(active)) {
    writeFileSync(active, '0');
  }
  return new Promise(resolveRun => {
    const child = spawn(
      process.execPath,
      [
        wrapper,
        '--',
        process.execPath,
        '-e',
        ownerScript(durationMs),
        marker,
        active,
      ],
      {
        cwd: repoRoot,
        env: wrapperEnv(stateDir, options.env),
        stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      }
    );
    childProcesses.push(child);
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout.on('data', chunk => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString('utf8');
      });
    }
    child.once('exit', code =>
      resolveRun({ code, stdout, stderr, pid: child.pid })
    );
  });
}

function maxConcurrentOwners(markerPath) {
  const lines = readFileSync(markerPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  return lines.reduce((max, line) => {
    const match = /concurrent=(\d+)/.exec(line);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function writeLock(stateDir, lock) {
  writeFileSync(resolve(stateDir, 'lock.json'), JSON.stringify(lock, null, 2));
}

function holdLiveProcess(ms = 5_000) {
  const child = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`], {
    stdio: 'ignore',
  });
  childProcesses.push(child);
  return child;
}

describe('typecheck singleflight lock recovery', () => {
  const staleMs = 30 * 60_000;
  const nowMs = 1_700_000_000_000;

  it('never marks a live owner recoverable solely because the lock is old', () => {
    const recovery = evaluateLockRecovery(
      {
        pid: process.pid,
        startedAtMs: nowMs - staleMs - 60_000,
        cwd: 'apps/web',
        command: ['tsc', '--noEmit'],
      },
      {
        nowMs,
        staleMs,
        lockFileAgeMs: staleMs + 60_000,
        isProcessAlive: () => true,
      }
    );

    expect(recovery).toMatchObject({
      recoverable: false,
      reason: null,
      pid: process.pid,
    });
  });

  it('recovers a dead owner immediately, even when the lock is young', () => {
    const recovery = evaluateLockRecovery(
      {
        pid: 2_147_483_646,
        startedAtMs: nowMs - 1_000,
        cwd: 'apps/web',
        command: ['tsc', '--noEmit'],
      },
      {
        nowMs,
        staleMs,
        lockFileAgeMs: 1_000,
        isProcessAlive: () => false,
      }
    );

    expect(recovery).toMatchObject({
      recoverable: true,
      reason: 'dead-owner',
      pid: 2_147_483_646,
      cwd: 'apps/web',
      command: ['tsc', '--noEmit'],
    });
  });

  it('recovers missing-pid locks only after the stale window', () => {
    const young = evaluateLockRecovery(
      {
        startedAtMs: nowMs - 1_000,
        cwd: '.',
        command: ['tsc'],
      },
      {
        nowMs,
        staleMs,
        lockFileAgeMs: 1_000,
        isProcessAlive: () => true,
      }
    );
    const old = evaluateLockRecovery(
      {
        startedAtMs: nowMs - staleMs - 1,
        cwd: '.',
        command: ['tsc'],
      },
      {
        nowMs,
        staleMs,
        lockFileAgeMs: staleMs + 1,
        isProcessAlive: () => true,
      }
    );

    expect(young.recoverable).toBe(false);
    expect(old).toMatchObject({
      recoverable: true,
      reason: 'missing-pid-stale-by-age',
      pid: null,
    });
  });

  it('recovers corrupt JSON only after the bounded file-age window', () => {
    const fresh = evaluateLockRecovery(null, {
      nowMs,
      staleMs,
      lockFileAgeMs: 1_000,
      isProcessAlive: () => true,
    });
    const aged = evaluateLockRecovery(null, {
      nowMs,
      staleMs,
      lockFileAgeMs: 5_001,
      isProcessAlive: () => true,
    });

    expect(fresh.recoverable).toBe(false);
    expect(aged).toMatchObject({
      recoverable: true,
      reason: 'corrupt-or-unreadable-lock',
    });
  });

  it('normalizes string pids and keeps live string owners non-recoverable by age', () => {
    expect(normalizePid('4242')).toBe(4242);
    expect(normalizePid('nope')).toBeNull();

    const recovery = evaluateLockRecovery(
      {
        pid: String(process.pid),
        startedAtMs: nowMs - staleMs - 1,
        cwd: '.',
        command: ['tsc'],
      },
      {
        nowMs,
        staleMs,
        lockFileAgeMs: staleMs + 1,
        isProcessAlive: pid => pid === process.pid,
      }
    );

    expect(recovery.recoverable).toBe(false);
  });

  it('logs owner cwd, command, age, and recovery reason without secrets', () => {
    const line = formatRecoveryLogLine(
      {
        recoverable: true,
        reason: 'dead-owner',
        ageMs: 95_000,
        pid: 99,
        cwd: 'apps/web',
        command: ['tsc', '-p', 'tsconfig.json'],
      },
      parts => parts.join(' ')
    );

    expect(line).toContain('pid 99');
    expect(line).toContain('cwd=apps/web');
    expect(line).toContain('command=tsc -p tsconfig.json');
    expect(line).toContain('age=95s');
    expect(line).toContain('reason=dead-owner');
  });
});

describe('typecheck singleflight process integration', () => {
  it('never evicts a live owner solely because its lock is old', async () => {
    const stateDir = makeStateDir();
    const marker = resolve(stateDir, 'owners.txt');

    // STALE_MS=100 and second starts at 250ms: age-first recovery would spawn
    // a concurrent second owner while the first is still live.
    const first = runWrapper(stateDir, marker, { durationMs: 700 });
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
    const second = runWrapper(stateDir, marker, { durationMs: 700 });

    const results = await Promise.all([first, second]);
    expect(results.map(result => result.code)).toEqual([0, 0]);
    expect(maxConcurrentOwners(marker)).toBe(1);
    // Waiter may re-run after the first completes (result fingerprint matches
    // when commands are identical) — either reuse or a single serialized re-run
    // is fine; concurrent owners are not.
    const ownerLines = readFileSync(marker, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(ownerLines.length).toBeGreaterThanOrEqual(1);
    expect(ownerLines.length).toBeLessThanOrEqual(2);
  });

  it('reclaims a dead owner and becomes the sole live tsc owner', async () => {
    const stateDir = makeStateDir();
    const marker = resolve(stateDir, 'owners.txt');
    writeLock(stateDir, {
      pid: 2_147_483_646,
      startedAtMs: Date.now() - 1_000,
      cwd: '.',
      command: ['tsc', '--noEmit'],
      repoRoot,
      fingerprint: 'dead-owner-fixture',
    });

    const result = await runWrapper(stateDir, marker, {
      durationMs: 50,
      capture: true,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('reason=dead-owner');
    expect(result.stderr).toContain('cwd=.');
    expect(maxConcurrentOwners(marker)).toBe(1);
    expect(existsSync(resolve(stateDir, 'lock.json'))).toBe(false);
  });

  it('does not reclaim a live seeded owner while it is still alive', async () => {
    const stateDir = makeStateDir();
    const marker = resolve(stateDir, 'owners.txt');
    const active = resolve(stateDir, 'active.txt');
    writeFileSync(active, '0');
    const holder = holdLiveProcess(3_000);
    writeLock(stateDir, {
      pid: holder.pid,
      startedAtMs: Date.now() - 60_000,
      cwd: 'apps/web',
      command: ['tsc', '--noEmit'],
      repoRoot,
      fingerprint: 'live-old-owner-fixture',
    });

    const waiter = spawn(
      process.execPath,
      [wrapper, '--', process.execPath, '-e', ownerScript(50), marker, active],
      {
        cwd: repoRoot,
        env: wrapperEnv(stateDir),
        stdio: 'ignore',
      }
    );
    childProcesses.push(waiter);

    await new Promise(resolveWait => setTimeout(resolveWait, 400));
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(resolve(stateDir, 'lock.json'))).toBe(true);

    holder.kill('SIGKILL');
    const code = await new Promise(resolveExit =>
      waiter.once('exit', resolveExit)
    );
    expect(code).toBe(0);
    expect(maxConcurrentOwners(marker)).toBe(1);
  });

  it('reclaims missing-pid locks after the stale window', async () => {
    const stateDir = makeStateDir();
    const marker = resolve(stateDir, 'owners.txt');
    writeLock(stateDir, {
      startedAtMs: Date.now() - 5_000,
      cwd: '.',
      command: ['tsc'],
      repoRoot,
      fingerprint: 'missing-pid-fixture',
    });

    const result = await runWrapper(stateDir, marker, {
      durationMs: 50,
      capture: true,
      env: { TYPECHECK_SINGLEFLIGHT_STALE_MS: '100' },
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('reason=missing-pid-stale-by-age');
    expect(maxConcurrentOwners(marker)).toBe(1);
  });

  it('reclaims corrupt lock JSON after the bounded file-age window', async () => {
    const stateDir = makeStateDir();
    const marker = resolve(stateDir, 'owners.txt');
    const lockPath = resolve(stateDir, 'lock.json');
    writeFileSync(lockPath, '{not-json');
    const aged = (Date.now() - 10_000) / 1000;
    utimesSync(lockPath, aged, aged);

    const result = await runWrapper(stateDir, marker, {
      durationMs: 50,
      capture: true,
      env: { TYPECHECK_SINGLEFLIGHT_STALE_MS: '30000' },
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('reason=corrupt-or-unreadable-lock');
    expect(maxConcurrentOwners(marker)).toBe(1);
  });

  it('reuses a completed result within the reuse window without a second owner', async () => {
    const stateDir = makeStateDir();
    const marker = resolve(stateDir, 'owners.txt');

    const first = await runWrapper(stateDir, marker, {
      durationMs: 50,
      capture: true,
    });
    expect(first.code).toBe(0);

    const second = await runWrapper(stateDir, marker, {
      durationMs: 50,
      capture: true,
    });
    expect(second.code).toBe(0);
    expect(second.stderr).toContain('reused completed');
    // Reuse must not re-execute the owner command.
    expect(readFileSync(marker, 'utf8').trim().split('\n')).toEqual([
      'owner concurrent=1',
    ]);
  });
});
