#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_POLL_MS = 500;
const DEFAULT_REUSE_WINDOW_MS = 30_000;
const DEFAULT_STALE_MS = 30 * 60_000;
const MAX_REPLAY_BYTES = 1_000_000;

const separatorIndex = process.argv.indexOf('--');
const rawCommand =
  separatorIndex === -1 ? [] : process.argv.slice(separatorIndex + 1);
const command = normalizeCommand(rawCommand);

if (command.length === 0) {
  console.error(
    'Usage: node scripts/typecheck-singleflight.mjs -- <command> [...args]'
  );
  process.exit(1);
}

const cwd = process.cwd();
const repoRoot = resolveRepoRoot();
const stateDir = resolve(
  process.env.TYPECHECK_SINGLEFLIGHT_DIR ??
    `${repoRoot}/.cache/typecheck-singleflight`
);
const lockPath = `${stateDir}/lock.json`;
const resultPath = `${stateDir}/result.json`;
const pollMs = readPositiveInt(
  'TYPECHECK_SINGLEFLIGHT_POLL_MS',
  DEFAULT_POLL_MS
);
const reuseWindowMs = readPositiveInt(
  'TYPECHECK_SINGLEFLIGHT_REUSE_WINDOW_MS',
  DEFAULT_REUSE_WINDOW_MS
);
const staleMs = readPositiveInt(
  'TYPECHECK_SINGLEFLIGHT_STALE_MS',
  DEFAULT_STALE_MS
);
const invocation = {
  command,
  cwd: relative(repoRoot, cwd) || '.',
  repoRoot,
  fingerprint: buildFingerprint(command),
};

mkdirSync(stateDir, { recursive: true });

const exitCode = await main();
process.exit(exitCode);

async function main() {
  let announcedWait = false;

  for (;;) {
    const reusableResult = readReusableResult();
    if (reusableResult) {
      replayResult(reusableResult);
      console.error(
        `[typecheck-singleflight] reused completed ${formatCommand(command)} result from pid ${reusableResult.pid}.`
      );
      return reusableResult.exitCode;
    }

    const lock = tryAcquireLock();
    if (lock.acquired) {
      return runAsOwner();
    }

    const existingLock = readJson(lockPath);
    if (isRecoverableLock(existingLock)) {
      removeStaleLock(existingLock);
      continue;
    }

    if (!announcedWait) {
      const owner = existingLock?.pid
        ? `pid ${existingLock.pid}`
        : 'another process';
      console.error(
        `[typecheck-singleflight] waiting for ${owner} to finish ${formatCommand(existingLock?.command ?? command)}.`
      );
      announcedWait = true;
    }

    await sleep(pollMs);
  }
}

function tryAcquireLock() {
  try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(
      fd,
      JSON.stringify(
        {
          ...invocation,
          pid: process.pid,
          startedAt: new Date().toISOString(),
          startedAtMs: Date.now(),
        },
        null,
        2
      )
    );
    closeSync(fd);
    return { acquired: true };
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
    return { acquired: false };
  }
}

async function runAsOwner() {
  const startedAtMs = Date.now();
  let exitCode = 1;

  try {
    const result = await runCommand(command);
    exitCode = result.exitCode;
    try {
      writeResult({
        ...invocation,
        pid: process.pid,
        exitCode: result.exitCode,
        stdout: capOutput(result.stdout),
        stderr: capOutput(result.stderr),
        startedAtMs,
        completedAtMs: Date.now(),
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `[typecheck-singleflight] could not write shared result: ${formatError(error)}`
      );
    }
    return exitCode;
  } finally {
    releaseLock();
  }
}

function runCommand([executable, ...args]) {
  return new Promise(resolveRun => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', chunk => {
      stdout.push(Buffer.from(chunk));
      process.stdout.write(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr.push(Buffer.from(chunk));
      process.stderr.write(chunk);
    });
    child.on('error', error => {
      const message = `Failed to start ${formatCommand(command)}: ${error.message}\n`;
      process.stderr.write(message);
      stderr.push(Buffer.from(message));
      resolveRun({
        exitCode: 127,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
    child.on('close', code => {
      resolveRun({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

function readReusableResult() {
  const result = readJson(resultPath);
  if (!result || !matchesInvocation(result)) {
    return null;
  }
  if (Date.now() - Number(result.completedAtMs ?? 0) > reuseWindowMs) {
    return null;
  }
  return result;
}

function matchesInvocation(value) {
  return (
    value.repoRoot === invocation.repoRoot &&
    value.cwd === invocation.cwd &&
    value.fingerprint === invocation.fingerprint &&
    JSON.stringify(value.command) === JSON.stringify(invocation.command)
  );
}

function replayResult(result) {
  if (typeof result.stdout?.text === 'string') {
    process.stdout.write(result.stdout.text);
  }
  if (typeof result.stderr?.text === 'string') {
    process.stderr.write(result.stderr.text);
  }
  if (result.stdout?.truncated || result.stderr?.truncated) {
    console.error(
      '[typecheck-singleflight] replayed output was truncated in the shared result file.'
    );
  }
}

function writeResult(result) {
  const tempPath = `${resultPath}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(result, null, 2));
  renameSync(tempPath, resultPath);
}

function releaseLock() {
  rmSync(lockPath, { force: true });
}

function removeStaleLock(lock) {
  const owner = lock?.pid ? `pid ${lock.pid}` : 'unknown pid';
  console.error(
    `[typecheck-singleflight] removing stale typecheck lock held by ${owner}.`
  );
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function isRecoverableLock(lock) {
  if (!lock) {
    return lockFileAgeMs() > Math.min(staleMs, 5000);
  }

  const ageMs = Date.now() - Number(lock.startedAtMs ?? 0);
  if (Number.isFinite(ageMs) && ageMs > staleMs) {
    return true;
  }

  return typeof lock.pid === 'number' && !isProcessAlive(lock.pid);
}

function lockFileAgeMs() {
  try {
    return Date.now() - statSync(lockPath).mtimeMs;
  } catch {
    return 0;
  }
}

function isProcessAlive(pid) {
  if (pid === process.pid) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function capOutput(buffer) {
  const truncated = buffer.length > MAX_REPLAY_BYTES;
  const start = truncated
    ? buffer.subarray(buffer.length - MAX_REPLAY_BYTES)
    : buffer;
  return {
    text: start.toString('utf8'),
    truncated,
  };
}

function buildFingerprint(commandParts) {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      command: commandParts,
      cwd: relative(repoRoot, cwd) || '.',
      repoRoot,
    })
  );
  hash.update('\0HEAD\0');
  hash.update(runGit(['rev-parse', 'HEAD']));
  hash.update('\0DIFF\0');
  hash.update(runGit(['diff', '--binary', '--no-ext-diff', 'HEAD', '--']));
  hash.update('\0UNTRACKED\0');

  for (const file of listUntrackedFiles()) {
    hash.update(file);
    hash.update('\0');
    try {
      hash.update(readFileSync(resolve(repoRoot, file)));
    } catch {
      hash.update('<unreadable>');
    }
    hash.update('\0');
  }

  return hash.digest('hex');
}

function listUntrackedFiles() {
  const output = runGit(['ls-files', '--others', '--exclude-standard', '-z']);
  return output.toString('utf8').split('\0').filter(Boolean).sort();
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout : Buffer.from('');
}

function resolveRepoRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout.trim() : cwd;
}

function readPositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeCommand(parts) {
  if (parts[0] !== 'tsc') {
    return parts;
  }

  return parts.filter(part => part !== '--');
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatCommand(parts) {
  return Array.isArray(parts) ? parts.join(' ') : String(parts);
}
