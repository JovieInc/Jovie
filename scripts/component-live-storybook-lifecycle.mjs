#!/usr/bin/env node
/**
 * Bounded process-group + temp-dir lifecycle for live Storybook certification
 * (JOV-5454). Cleanup runs on pass, failure, or timeout.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const LIVE_CERT_TIMEOUT_MS = 12 * 60 * 1000;
export const STORYBOOK_READY_TIMEOUT_MS = 8 * 60 * 1000;
export const STORYBOOK_POLL_MS = 250;

export function createWorkDir(prefix = 'jovie-live-sb-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeWorkDir(dir) {
  if (typeof dir !== 'string' || dir.trim() === '') return;
  rmSync(dir, { recursive: true, force: true });
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions} [options]
 */
export function spawnProcessGroup(command, args, options = {}) {
  return spawn(command, args, {
    ...options,
    detached: true,
    stdio: options.stdio ?? 'pipe',
  });
}

/**
 * @param {import('node:child_process').ChildProcess | { pid?: number } | null} child
 * @param {NodeJS.Signals | number} [signal]
 */
export function killProcessGroup(child, signal = 'SIGTERM') {
  const pid = child && typeof child.pid === 'number' ? child.pid : null;
  if (pid === null) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // group already gone or this pid is not a group leader
  }
  try {
    process.kill(pid, signal);
  } catch {
    // already gone
  }
}

export function isProcessGone(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

export async function waitUntilProcessGone(pid, timeoutMs = 2_000) {
  const started = Date.now();
  while (!isProcessGone(pid)) {
    if (Date.now() - started >= timeoutMs) return false;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return true;
}

async function reapStarted(started) {
  for (const child of started) killProcessGroup(child, 'SIGKILL');
  await Promise.all(
    started.map(child => waitUntilProcessGone(child?.pid, 2_000))
  );
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, signal?: AbortSignal, fetchImpl?: typeof fetch }} [options]
 */
export async function waitForUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? STORYBOOK_READY_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = Date.now();
  let lastError = 'not attempted';
  while (Date.now() - started < timeoutMs) {
    if (options.signal?.aborted) {
      throw new Error('live Storybook wait aborted; fail closed');
    }
    try {
      const response = await fetchImpl(url, { signal: options.signal });
      if (response.ok) return true;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, STORYBOOK_POLL_MS));
  }
  throw new Error(
    `live Storybook server was not reachable at ${url} within ${timeoutMs}ms (${lastError}); fail closed`
  );
}

/**
 * Run `fn` with a temp dir and registered process groups. Always kills the
 * groups and removes the temp dir — success, thrown failure, or timeout.
 *
 * @template T
 * @param {{ timeoutMs?: number, prefix?: string, workDir?: string }} options
 * @param {(ctx: { dir: string, register: (child: import('node:child_process').ChildProcess) => import('node:child_process').ChildProcess, signal: AbortSignal }) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withBoundedLifecycle(options, fn) {
  const timeoutMs = options.timeoutMs ?? LIVE_CERT_TIMEOUT_MS;
  const dir = options.workDir ?? createWorkDir(options.prefix);
  const started = [];
  const abort = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
    for (const child of started) killProcessGroup(child, 'SIGKILL');
  }, timeoutMs);

  const register = child => {
    started.push(child);
    return child;
  };

  try {
    const result = await fn({ dir, register, signal: abort.signal });
    if (timedOut) {
      throw new Error(
        `live Storybook certification timed out after ${timeoutMs}ms; fail closed`
      );
    }
    return result;
  } catch (error) {
    await reapStarted(started);
    if (timedOut) {
      throw new Error(
        `live Storybook certification timed out after ${timeoutMs}ms; fail closed`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    await reapStarted(started);
    removeWorkDir(dir);
  }
}

export function receiptPathFor(dir) {
  return join(ensureDir(dirname(join(dir, 'receipt.json'))), 'receipt.json');
}
