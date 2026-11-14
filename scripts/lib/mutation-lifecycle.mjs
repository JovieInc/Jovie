import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A detached group is the ownership boundary, including children after its leader exits. */
function groupMembers(pid) {
  const snapshot = spawnSync('ps', ['-eo', 'pid=,pgid=,stat=,lstart='], {
    encoding: 'utf8',
    timeout: 2000,
  });
  if (snapshot.status !== 0)
    throw new Error('mutation process-group snapshot unavailable');
  return snapshot.stdout.split('\n').flatMap(line => {
    const row = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/u.exec(line);
    return row && Number(row[2]) === pid && !/^[ZX]/u.test(row[3])
      ? [{ pid: Number(row[1]), started: row[4] }]
      : [];
  });
}

function signalGroup(pid, started, signal, sampleGroup, sendSignal) {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid)
    throw new Error('mutation process-group identity unavailable');
  const leader = sampleGroup(pid).find(member => member.pid === pid);
  if (leader && leader.started !== started) {
    const error = new Error('mutation process-group identity changed');
    error.name = 'MutationIdentityChanged';
    throw error;
  }
  try {
    sendSignal(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function stopped(pid, timeoutMs, sampleGroup) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (sampleGroup(pid).length === 0) return true;
    await pause(20);
  } while (Date.now() < deadline);
  return sampleGroup(pid).length === 0;
}

function claimWorktree(cwd) {
  const dir = join(cwd, '.stryker-tmp');
  mkdirSync(dir, { recursive: true });
  const lease = join(dir, 'sweep-owner');
  try {
    mkdirSync(lease);
  } catch {
    throw new Error(`mutation worktree already owned: ${lease}`);
  }
  const owner = JSON.stringify({
    schema: 'mutation-worktree-owner/v1',
    pid: process.pid,
    token: randomUUID(),
  });
  const path = join(lease, 'owner.json');
  writeFileSync(path, owner);
  const validate = () => {
    if (readFileSync(path, 'utf8') !== owner)
      throw new Error('mutation root ownership changed; preserved');
  };
  return {
    dir,
    validate,
    release: () => {
      validate();
      rmSync(lease, { recursive: true });
    },
  };
}

function recoveryFiles(tempDir) {
  return globSync('backup-*/**/*', { cwd: tempDir, withFileTypes: true })
    .filter(entry => entry.isFile() || entry.isSymbolicLink())
    .map(entry => ({
      path: join(entry.parentPath, entry.name),
      source: relative(tempDir, join(entry.parentPath, entry.name))
        .replaceAll('\\', '/')
        .split('/')
        .slice(1)
        .join('/'),
      regular: entry.isFile(),
    }));
}

function sourceRecovery(sourcePath, rootDir, tempDir) {
  if (!lstatSync(sourcePath).isFile() || lstatSync(sourcePath).isSymbolicLink())
    throw new Error('mutation source must be a regular file');
  const original = readFileSync(sourcePath);
  if (
    original.includes(Buffer.from('__stryker__')) &&
    /\bfunction stryNS_/u.test(original.toString())
  )
    throw new Error(
      'mutation source is already instrumented; recovery required'
    );
  const sourceRel = relative(rootDir, sourcePath).replaceAll('\\', '/');
  let instrumented;
  // Freeze the first owned instrumentation change; later edits must never be
  // authorized merely because they still contain a Stryker marker.
  const capture = () => {
    if (
      instrumented ||
      !existsSync(sourcePath) ||
      !lstatSync(sourcePath).isFile()
    )
      return;
    const bytes = readFileSync(sourcePath);
    if (
      !bytes.includes(Buffer.from('__stryker__')) ||
      !/\bfunction stryNS_/u.test(bytes.toString())
    )
      return;
    const backup = recoveryFiles(tempDir).find(
      file => file.source === sourceRel && file.regular
    );
    if (backup && readFileSync(backup.path).equals(original)) {
      instrumented = bytes;
      const hash = value => createHash('sha256').update(value).digest('hex');
      writeFileSync(
        join(tempDir, 'recovery.json'),
        JSON.stringify({
          schema: 'mutation-source-recovery/v1',
          source: sourceRel,
          originalSha256: hash(original),
          instrumentedSha256: hash(instrumented),
        })
      );
    }
  };
  const observer = watch(dirname(sourcePath), (_, name) => {
    if (name === null || name?.toString() === basename(sourcePath)) {
      try {
        capture();
      } catch {
        /* incomplete writes stay unproved */
      }
    }
  });
  return {
    close: () => observer.close(),
    restore: () => {
      observer.close();
      for (const backup of recoveryFiles(tempDir)) {
        if (
          !backup.regular ||
          backup.source !== sourceRel ||
          !readFileSync(backup.path).equals(original)
        )
          throw new Error(
            'mutation has additional or mismatched recovery backups; preserved'
          );
      }
      const current =
        existsSync(sourcePath) && !lstatSync(sourcePath).isSymbolicLink()
          ? readFileSync(sourcePath)
          : null;
      if (current?.equals(original)) return;
      if (!instrumented || !current?.equals(instrumented))
        throw new Error(
          'mutation source differs from owned instrumentation snapshot; preserved'
        );
      writeFileSync(sourcePath, original);
      if (!readFileSync(sourcePath).equals(original))
        throw new Error('mutation source recovery unproved');
    },
  };
}

/**
 * Run one in-place mutation harness. Recovery precedes scratch deletion, and
 * reports from timeouts, interruptions, failed exits or unproved cleanup never count.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, rootDir: string, sourcePath: string, timeoutMs: number,
 *   env?: NodeJS.ProcessEnv, graceMs?: number, cleanupMs?: number,
 *   sampleGroup?: typeof groupMembers,
 *   sendSignal?: (pid: number, signal: NodeJS.Signals) => void }} options
 */
export async function runMutationHarness(command, args, options) {
  const {
    cwd,
    rootDir,
    sourcePath,
    timeoutMs,
    env = process.env,
    graceMs = 1000,
    cleanupMs = 2000,
    sampleGroup = groupMembers,
    sendSignal = (pid, signal) => process.kill(pid, signal),
  } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('mutation timeout must be positive');
  if (process.platform === 'win32')
    throw new Error('mutation sweep requires POSIX process-group cleanup');
  const owner = claimWorktree(cwd);
  let tempDir;
  let recovery;
  let child;
  try {
    const scratchRoot = join(rootDir, '.stryker-tmp');
    mkdirSync(scratchRoot, { recursive: true });
    tempDir = mkdtempSync(join(scratchRoot, 'sweep-'));
    recovery = sourceRecovery(sourcePath, rootDir, tempDir);
    child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: 'inherit',
      env: { ...env, STRYKER_TEMP_DIR: tempDir },
    });
  } catch (error) {
    recovery?.close();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    owner.release();
    throw error;
  }
  let error;
  let status = null;
  let signal = null;
  let timedOut = false;
  let interrupted = false;
  let cleanupProved = false;
  let cleanupError;
  let wake = () => {};
  const stopRequested = new Promise(resolve => {
    wake = () => resolve(undefined);
  });
  const stop = reason => {
    error ??= new Error(reason);
    wake();
  };
  const interrupt = received => {
    interrupted = true;
    stop(`mutation harness interrupted (${received})`);
  };
  const onInt = () => interrupt('SIGINT');
  const onTerm = () => interrupt('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  const exited = new Promise(resolve => {
    child.once('error', reason => {
      error ??= reason;
      resolve();
    });
    child.once('exit', (code, received) => {
      status = code;
      signal = received;
      resolve();
    });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    stop(`mutation harness timed out after ${timeoutMs}ms`);
  }, timeoutMs);
  try {
    const started = child.pid
      ? sampleGroup(child.pid).find(member => member.pid === child.pid)?.started
      : null;
    await Promise.race([exited, stopRequested]);
    clearTimeout(timer);
    if (child.pid) {
      const members = sampleGroup(child.pid);
      if (members.length > 0) {
        error ??= new Error('mutation harness exited with live descendants');
        signalGroup(child.pid, started, 'SIGTERM', sampleGroup, sendSignal);
        if (!(await stopped(child.pid, graceMs, sampleGroup)))
          signalGroup(child.pid, started, 'SIGKILL', sampleGroup, sendSignal);
        if (!(await stopped(child.pid, cleanupMs, sampleGroup)))
          throw new Error(
            'mutation descendants remain live; recovery backups preserved'
          );
      }
    }
    await exited;
    if (status !== 0)
      error ??= new Error(`mutation harness exit ${status ?? signal}`);
    owner.validate();
    recovery.restore();
    owner.validate();
    // Never delete foreign or pre-existing .stryker-tmp entries.
    rmSync(tempDir, { recursive: true, force: true });
    owner.release();
    cleanupProved = true;
  } catch (reason) {
    error ??= reason;
    cleanupError = reason;
    // An observer error must not strand the child we just spawned. This direct
    // child identity is still owned until Node reports its exit; do not signal
    // an unrelated or already-reaped PID when process evidence is unavailable.
    if (
      reason?.name !== 'MutationIdentityChanged' &&
      child.pid &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      try {
        sendSignal(-child.pid, 'SIGKILL');
      } catch {
        /* failure remains unproved */
      }
    }
  } finally {
    clearTimeout(timer);
    recovery.close();
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
  return {
    status,
    signal,
    error,
    timedOut,
    interrupted,
    cleanupProved,
    cleanupError,
    tempDir,
    processGroup: child.pid,
  };
}

/** A partial report is never sufficient after an unsuccessful harness. */
export const mutationRunSucceeded = run =>
  run.status === 0 && !run.error && run.cleanupProved === true;
