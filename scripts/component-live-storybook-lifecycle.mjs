/**
 * Bounded process-group + temp-dir lifecycle for live Storybook certification
 * (JOV-5454). Cleanup runs on pass, failure, or timeout.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE_CERT_TIMEOUT_MS = 12 * 60 * 1000;
export const STORYBOOK_READY_TIMEOUT_MS = 8 * 60 * 1000;
export const STORYBOOK_POLL_MS = 250;
export const STORYBOOK_VITEST_OWNER_ARG = '--jovie-storybook-vitest-owner=';
export const STORYBOOK_VITEST_RUN_TIMEOUT_MS = 12 * 60 * 1000;

const SYSTEM_TMP_DIR = tmpdir();
const STORYBOOK_VITEST_LEASE_DIR = join(
  SYSTEM_TMP_DIR,
  'jovie-storybook-vitest-leases'
);
const STORYBOOK_VITEST_TMP_PREFIX = 'jovie-storybook-vitest-';
const STORYBOOK_VITEST_WATCHDOG_POLL_MS = 2_000;
const STORYBOOK_VITEST_TERMINATION_GRACE_MS = 500;
const STORYBOOK_VITEST_CLEANUP_TIMEOUT_MS = 3_000;
const PROCESS_SNAPSHOT_TIMEOUT_MS = 2_000;
const PROCESS_SNAPSHOT_MAX_BUFFER = 16 * 1024 * 1024;
const LOST_OWNER_CONFIRMATIONS = 2;
const CURRENT_FILE = fileURLToPath(import.meta.url);
const STORYBOOK_VITEST_WATCHDOG_FLAG = '--storybook-vitest-watchdog';
const STORYBOOK_VITEST_OWNER_TITLE = 'jovie-storybook-vitest:';
const CHROMIUM_EXECUTABLES = new Set([
  'chrome',
  'chromium',
  'chrome-headless-shell',
  'headless_shell',
]);

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

/**
 * Read the single-letter process state from /proc (Linux). Returns null when
 * unavailable (non-Linux, or the process is already reaped). A `Z` state means
 * the process is a defunct zombie: it has exited and cannot act, so it is gone
 * even though `kill(pid, 0)` still succeeds until a parent reaps it.
 */
function readProcState(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const closeParen = stat.lastIndexOf(')');
    if (closeParen === -1) return null;
    return stat.slice(closeParen + 2, closeParen + 3) ?? null;
  } catch {
    return null;
  }
}

export function isProcessGone(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  const state = readProcState(pid);
  if (state === 'Z') return true;
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

function readProcessRows() {
  const result = spawnSync(
    'ps',
    [
      '-ww',
      '-e',
      '-o',
      'pid=',
      '-o',
      'ppid=',
      '-o',
      'pgid=',
      '-o',
      'lstart=',
      '-o',
      'stat=',
      '-o',
      'command=',
    ],
    {
      encoding: 'utf8',
      maxBuffer: PROCESS_SNAPSHOT_MAX_BUFFER,
      timeout: PROCESS_SNAPSHOT_TIMEOUT_MS,
    }
  );
  if (result.error || result.status !== 0) return null;
  const rows = result.stdout
    .split('\n')
    .map(line => {
      const match = line.match(
        /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.+)$/
      );
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        startedAt: match[4],
        stat: match[5],
        command: match[6],
      };
    })
    .filter(Boolean);
  return rows.length > 0 ? rows : null;
}

function controllerPidsFor(ownerPid, rows = readProcessRows()) {
  if (!rows) return [];
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const controllers = [];
  let current = byPid.get(ownerPid);
  while (current?.ppid > 1 && controllers.length < 4) {
    controllers.push(current.ppid);
    current = byPid.get(current.ppid);
  }
  return controllers;
}

function commandTokens(command) {
  return (
    command
      .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
      ?.map(token => token.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2')) ??
    []
  );
}

function isChromiumLeader(command) {
  const executable = command.match(/^\s*(\S+)/)?.[1];
  return CHROMIUM_EXECUTABLES.has(basename(executable ?? '').toLowerCase());
}

function isSafeToken(token) {
  return (
    typeof token === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token
    )
  );
}

function isOwnedTempRoot(path) {
  return (
    typeof path === 'string' &&
    resolve(dirname(path)) === resolve(SYSTEM_TMP_DIR) &&
    basename(path).startsWith(STORYBOOK_VITEST_TMP_PREFIX)
  );
}

function ensurePrivateLeaseDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Storybook Vitest lease path must be a private directory');
  }
  chmodSync(path, 0o700);
  return path;
}

/**
 * Return only browser leaders that carry both this run's unguessable owner
 * token and a Playwright-created profile inside its private temp root. Normal
 * Chrome never satisfies all three conditions.
 */
export function findOwnedPlaywrightBrowsers(rows, token, tempRoot) {
  if (!isSafeToken(token) || !isOwnedTempRoot(tempRoot)) return [];
  const marker = `${STORYBOOK_VITEST_OWNER_ARG}${token}`;
  const ownedRoot = `${resolve(tempRoot)}${sep}`;
  return rows.filter(row => {
    if (!row?.command || !isChromiumLeader(row.command)) return false;
    const tokens = commandTokens(row.command);
    if (!tokens.includes(marker)) return false;
    const profileArg = tokens.find(token =>
      token.startsWith('--user-data-dir=')
    );
    const rawUserDataDir = profileArg?.slice('--user-data-dir='.length);
    const userDataDir = rawUserDataDir?.replace(
      /^(?:"([\s\S]*)"|'([\s\S]*)')$/,
      '$1$2'
    );
    if (
      !userDataDir ||
      !basename(userDataDir).startsWith('playwright_chromiumdev_profile-')
    ) {
      return false;
    }
    return resolve(userDataDir).startsWith(ownedRoot);
  });
}

function signalPid(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function processReceipt(row) {
  return {
    pid: row.pid,
    pgid: row.pgid,
    startedAt: row.startedAt,
    commandHash: createHash('sha256').update(row.command).digest('hex'),
  };
}

function sameProcessReceipt(row, receipt) {
  return (
    row?.pid === receipt?.pid &&
    row?.pgid === receipt?.pgid &&
    row?.startedAt === receipt?.startedAt &&
    createHash('sha256').update(row.command).digest('hex') ===
      receipt?.commandHash
  );
}

function ownerReceiptFromLease(lease) {
  return {
    pid: lease.ownerPid,
    pgid: lease.ownerPgid,
    startedAt: lease.ownerStartedAt,
    commandHash: lease.ownerCommandHash,
  };
}

function watchdogReceiptFromLease(lease) {
  if (lease.watchdogPid === null) return null;
  return {
    pid: lease.watchdogPid,
    pgid: lease.watchdogPgid,
    startedAt: lease.watchdogStartedAt,
    commandHash: lease.watchdogCommandHash,
  };
}

function receiptIsAlive(receipt, rows) {
  return Boolean(receipt) && rows.some(row => sameProcessReceipt(row, receipt));
}

/**
 * A SIGKILLed browser child whose leader already exited can linger as a
 * `<defunct>` zombie that init never reaps on some CI runners. Its pgid stays
 * in the process table forever, so a zombie row must not count as a live group.
 */
function isZombieRow(row) {
  return typeof row?.stat === 'string' && row.stat.startsWith('Z');
}

function ownerIsAlive(lease, rows) {
  return receiptIsAlive(ownerReceiptFromLease(lease), rows);
}

function captureOwnedPlaywrightGroups(token, tempRoot, rows) {
  if (!rows) return null;
  return findOwnedPlaywrightBrowsers(rows, token, tempRoot)
    .filter(leader => leader.pgid === leader.pid)
    .map(leader => ({
      leader: processReceipt(leader),
      members: rows.filter(row => row.pgid === leader.pgid).map(processReceipt),
    }));
}

function mergeOwnedBrowserGroups(...groupLists) {
  const merged = new Map();
  for (const groups of groupLists) {
    for (const group of groups ?? []) {
      const key = `${group.leader.pid}:${group.leader.startedAt}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, structuredClone(group));
        continue;
      }
      const memberKeys = new Set(
        existing.members.map(
          member => `${member.pid}:${member.startedAt}:${member.pgid}`
        )
      );
      for (const member of group.members) {
        const memberKey = `${member.pid}:${member.startedAt}:${member.pgid}`;
        if (!memberKeys.has(memberKey)) existing.members.push(member);
      }
    }
  }
  return [...merged.values()];
}

export function planOwnedBrowserSignals(groups, rows, token, tempRoot) {
  if (!rows) return { ok: false, groupPids: [], individualPids: [] };
  const groupPids = [];
  const individualPids = [];
  for (const group of groups) {
    const leaderAtPid = rows.find(row => row.pid === group.leader.pid);
    const leaderIsStillOwned =
      sameProcessReceipt(leaderAtPid, group.leader) &&
      findOwnedPlaywrightBrowsers([leaderAtPid], token, tempRoot).length === 1;
    if (leaderIsStillOwned) {
      groupPids.push(group.leader.pgid);
      continue;
    }
    for (const member of group.members) {
      if (member.pid === group.leader.pid) continue;
      const current = rows.find(row => row.pid === member.pid);
      if (sameProcessReceipt(current, member)) individualPids.push(member.pid);
    }
  }
  return {
    ok: true,
    groupPids: [...new Set(groupPids)],
    individualPids: [...new Set(individualPids)],
  };
}

/**
 * Group signaling requires the exact live token/profile leader. Once that
 * leader is gone, only originally captured helpers are signaled individually,
 * so numeric PGID reuse can never target an unrelated browser group.
 */
function signalOwnedBrowserGroups(
  groups,
  token,
  tempRoot,
  signal,
  rows = readProcessRows()
) {
  const plan = planOwnedBrowserSignals(groups, rows, token, tempRoot);
  if (!plan.ok) return false;
  for (const pgid of plan.groupPids) signalPid(-pgid, signal);
  for (const pid of plan.individualPids) signalPid(pid, signal);
  return true;
}

function removeStorybookVitestArtifacts(lease) {
  if (!isOwnedTempRoot(lease.tempRoot)) return false;
  try {
    removeWorkDir(lease.tempRoot);
    if (existsSync(lease.tempRoot)) return false;
    rmSync(lease.leasePath, { force: true });
    return !existsSync(lease.leasePath);
  } catch {
    return false;
  }
}

function isValidProcessReceipt(receipt) {
  return (
    Number.isInteger(receipt?.pid) &&
    receipt.pid > 0 &&
    Number.isInteger(receipt?.pgid) &&
    receipt.pgid > 0 &&
    typeof receipt?.startedAt === 'string' &&
    receipt.startedAt.length > 0 &&
    typeof receipt?.commandHash === 'string' &&
    /^[0-9a-f]{64}$/.test(receipt.commandHash)
  );
}

function isValidBrowserGroup(group) {
  return (
    isValidProcessReceipt(group?.leader) &&
    group.leader.pid === group.leader.pgid &&
    Array.isArray(group?.members) &&
    group.members.length > 0 &&
    group.members.every(
      member =>
        isValidProcessReceipt(member) && member.pgid === group.leader.pgid
    )
  );
}

function persistStorybookVitestLease(lease) {
  const tempPath = `${lease.leasePath}.${process.pid}.${randomUUID()}.tmp`;
  const storedLease = { ...lease };
  delete storedLease.created;
  try {
    writeFileSync(tempPath, JSON.stringify(storedLease), {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(tempPath, lease.leasePath);
    return { ...storedLease, created: lease.created };
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function createStorybookVitestLease(options) {
  if (!isSafeToken(options.token)) {
    throw new Error('Storybook Vitest lease requires a valid owner token');
  }
  if (!isOwnedTempRoot(options.tempRoot)) {
    throw new Error('Storybook Vitest lease requires a private temp root');
  }
  const leaseDir = options.leaseDir ?? STORYBOOK_VITEST_LEASE_DIR;
  ensurePrivateLeaseDir(leaseDir);
  const leasePath = join(leaseDir, `${options.token}.json`);
  const lease = {
    version: 1,
    token: options.token,
    ownerPid: options.ownerPid,
    ownerPgid: options.ownerPgid,
    ownerStartedAt: options.ownerStartedAt,
    ownerCommandHash: options.ownerCommandHash,
    deadlineAt: options.deadlineAt,
    tempRoot: options.tempRoot,
    controllers: options.controllers ?? [],
    browserGroups: options.browserGroups ?? [],
    watchdogPid: options.watchdogPid ?? null,
    watchdogPgid: options.watchdogPgid ?? null,
    watchdogStartedAt: options.watchdogStartedAt ?? null,
    watchdogCommandHash: options.watchdogCommandHash ?? null,
    leasePath,
  };
  try {
    writeFileSync(leasePath, JSON.stringify(lease), {
      flag: 'wx',
      mode: 0o600,
    });
    return { ...lease, created: true };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = readStorybookVitestLease(leasePath);
    if (!existing) throw error;
    return { ...existing, created: false };
  }
}

function readStorybookVitestLease(leasePath) {
  try {
    const lease = JSON.parse(readFileSync(leasePath, 'utf8'));
    if (
      lease?.version !== 1 ||
      !isSafeToken(lease.token) ||
      !isValidProcessReceipt(ownerReceiptFromLease(lease)) ||
      !isOwnedTempRoot(lease.tempRoot) ||
      !Array.isArray(lease.controllers) ||
      !lease.controllers.every(isValidProcessReceipt) ||
      !Array.isArray(lease.browserGroups) ||
      !lease.browserGroups.every(isValidBrowserGroup) ||
      !(
        (lease.watchdogPid === null &&
          lease.watchdogPgid === null &&
          lease.watchdogStartedAt === null &&
          lease.watchdogCommandHash === null) ||
        isValidProcessReceipt(watchdogReceiptFromLease(lease))
      )
    ) {
      return null;
    }
    return { ...lease, leasePath };
  } catch {
    return null;
  }
}

function recordBrowserGroups(lease, rows) {
  const captured = captureOwnedPlaywrightGroups(
    lease.token,
    lease.tempRoot,
    rows
  );
  if (!captured) return null;
  const browserGroups = mergeOwnedBrowserGroups(lease.browserGroups, captured);
  if (JSON.stringify(browserGroups) === JSON.stringify(lease.browserGroups)) {
    return lease;
  }
  return persistStorybookVitestLease({ ...lease, browserGroups });
}

function hasLostController(lease, rows) {
  return (lease.controllers ?? []).some(
    controller => !receiptIsAlive(controller, rows)
  );
}

/**
 * Restart recovery for a watchdog that was itself interrupted. A lease is
 * reaped only when the exact owner start identity is gone, a tracked
 * controller is gone, or its hard deadline has elapsed.
 */
export async function reapStaleStorybookVitestLeases(options = {}) {
  const leaseDir = options.leaseDir ?? STORYBOOK_VITEST_LEASE_DIR;
  ensurePrivateLeaseDir(leaseDir);
  const reapedTokens = [];
  const rows = readProcessRows();
  if (!rows) return { reapedTokens, processTableAvailable: false };
  for (const name of readdirSync(leaseDir)) {
    if (!name.endsWith('.json')) continue;
    const leasePath = join(leaseDir, name);
    const lease = readStorybookVitestLease(leasePath);
    if (!lease) continue;
    const ownerAlive = ownerIsAlive(lease, rows);
    const expired =
      typeof lease.deadlineAt === 'number' && Date.now() >= lease.deadlineAt;
    if (ownerAlive && !expired && !hasLostController(lease, rows)) continue;
    if (await finishOwnedRun(lease, 'SIGTERM')) {
      reapedTokens.push(lease.token);
    }
  }
  return { reapedTokens, processTableAvailable: true };
}

async function finishOwnedRun(lease, ownerSignal) {
  try {
    let rows = readProcessRows();
    if (!rows) return false;
    let activeLease = recordBrowserGroups(lease, rows);
    if (!activeLease) return false;

    if (ownerSignal && ownerIsAlive(activeLease, rows)) {
      signalPid(activeLease.ownerPid, ownerSignal);
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    rows = readProcessRows();
    if (!rows) return false;
    activeLease = recordBrowserGroups(activeLease, rows);
    if (!activeLease) return false;
    if (
      !signalOwnedBrowserGroups(
        activeLease.browserGroups,
        activeLease.token,
        activeLease.tempRoot,
        'SIGTERM'
      )
    ) {
      return false;
    }

    await new Promise(resolve =>
      setTimeout(resolve, STORYBOOK_VITEST_TERMINATION_GRACE_MS)
    );
    rows = readProcessRows();
    if (!rows) return false;
    activeLease = recordBrowserGroups(activeLease, rows);
    if (!activeLease) return false;
    if (ownerIsAlive(activeLease, rows)) {
      signalPid(activeLease.ownerPid, 'SIGKILL');
    }
    if (
      !signalOwnedBrowserGroups(
        activeLease.browserGroups,
        activeLease.token,
        activeLease.tempRoot,
        'SIGKILL'
      )
    ) {
      return false;
    }

    const cleanupDeadline = Date.now() + STORYBOOK_VITEST_CLEANUP_TIMEOUT_MS;
    while (Date.now() < cleanupDeadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      rows = readProcessRows();
      if (!rows) continue;
      const updatedLease = recordBrowserGroups(activeLease, rows);
      if (!updatedLease) continue;
      activeLease = updatedLease;
      if (ownerIsAlive(activeLease, rows)) {
        signalPid(activeLease.ownerPid, 'SIGKILL');
      }
      const markedBrowserRemains =
        findOwnedPlaywrightBrowsers(
          rows,
          activeLease.token,
          activeLease.tempRoot
        ).length > 0;
      const ownedGroupRemains = activeLease.browserGroups.some(group =>
        rows.some(row => row.pgid === group.leader.pgid && !isZombieRow(row))
      );
      if (ownedGroupRemains) {
        signalOwnedBrowserGroups(
          activeLease.browserGroups,
          activeLease.token,
          activeLease.tempRoot,
          'SIGKILL',
          rows
        );
      }
      const ownerRemains = ownerIsAlive(activeLease, rows);
      if (!ownerRemains && !markedBrowserRemains && !ownedGroupRemains) {
        return removeStorybookVitestArtifacts(activeLease);
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function runStorybookVitestWatchdog(leasePath) {
  let lease = readStorybookVitestLease(leasePath);
  if (!lease) return;
  let lostOwnerConfirmations = 0;
  while (true) {
    const refreshedLease = readStorybookVitestLease(leasePath);
    if (!refreshedLease) return;
    lease = refreshedLease;
    const rows = readProcessRows();
    if (!rows) {
      await new Promise(resolve =>
        setTimeout(resolve, STORYBOOK_VITEST_WATCHDOG_POLL_MS)
      );
      continue;
    }
    try {
      lease = recordBrowserGroups(lease, rows) ?? lease;
    } catch {
      await new Promise(resolve =>
        setTimeout(resolve, STORYBOOK_VITEST_WATCHDOG_POLL_MS)
      );
      continue;
    }
    const lostOwner =
      !ownerIsAlive(lease, rows) || hasLostController(lease, rows);
    lostOwnerConfirmations = lostOwner ? lostOwnerConfirmations + 1 : 0;
    if (
      lostOwnerConfirmations >= LOST_OWNER_CONFIRMATIONS ||
      (typeof lease.deadlineAt === 'number' && Date.now() >= lease.deadlineAt)
    ) {
      if (await finishOwnedRun(lease, 'SIGTERM')) return;
      lease = readStorybookVitestLease(leasePath);
      if (!lease) return;
    }
    await new Promise(resolve =>
      setTimeout(resolve, STORYBOOK_VITEST_WATCHDOG_POLL_MS)
    );
  }
}

/**
 * Start a detached supervisor for the Vitest process and return the Chromium
 * launch marker. The watchdog survives owner SIGKILL and cleans only that
 * run's private Playwright profile.
 */
async function ensureStorybookVitestWatchdog(lease) {
  const rows = readProcessRows();
  if (!rows) throw new Error('cannot inspect Storybook Vitest watchdog');
  if (receiptIsAlive(watchdogReceiptFromLease(lease), rows)) {
    return lease;
  }
  const watchdog = spawn(
    process.execPath,
    [CURRENT_FILE, STORYBOOK_VITEST_WATCHDOG_FLAG, lease.leasePath],
    {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        TMPDIR: SYSTEM_TMP_DIR,
        TMP: SYSTEM_TMP_DIR,
        TEMP: SYSTEM_TMP_DIR,
      },
    }
  );
  watchdog.unref();
  const identityDeadline = Date.now() + PROCESS_SNAPSHOT_TIMEOUT_MS;
  let watchdogReceipt = null;
  while (!watchdogReceipt && Date.now() < identityDeadline) {
    const watchdogRows = readProcessRows();
    const watchdogRow = watchdogRows?.find(row => row.pid === watchdog.pid);
    if (watchdogRow) watchdogReceipt = processReceipt(watchdogRow);
    if (!watchdogReceipt) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  if (!watchdogReceipt) {
    signalPid(watchdog.pid, 'SIGKILL');
    throw new Error('cannot establish Storybook Vitest watchdog identity');
  }
  return persistStorybookVitestLease({
    ...lease,
    watchdogPid: watchdogReceipt.pid,
    watchdogPgid: watchdogReceipt.pgid,
    watchdogStartedAt: watchdogReceipt.startedAt,
    watchdogCommandHash: watchdogReceipt.commandHash,
  });
}

export async function startStorybookVitestLifecycle(options = {}) {
  await reapStaleStorybookVitestLeases({ leaseDir: options.leaseDir });
  const token = options.token ?? randomUUID();
  if (!isSafeToken(token)) {
    throw new Error('invalid Storybook Vitest owner token');
  }
  // Bind owner identity to this unguessable run, avoiding second-resolution
  // process-start ambiguity on Darwin without touching any other process.
  process.title = `${STORYBOOK_VITEST_OWNER_TITLE}${token}`;
  const ownerPid = process.pid;
  const rows = readProcessRows();
  const owner = rows?.find(row => row.pid === ownerPid);
  if (!rows || !owner?.startedAt) {
    throw new Error('cannot establish Storybook Vitest owner identity');
  }
  const ownerReceipt = processReceipt(owner);
  const tempRoot = mkdtempSync(
    join(SYSTEM_TMP_DIR, STORYBOOK_VITEST_TMP_PREFIX)
  );
  const runMode = options.runMode !== false;
  const timeoutMs = options.timeoutMs ?? STORYBOOK_VITEST_RUN_TIMEOUT_MS;
  const controllerPids =
    options.controllerPids ?? controllerPidsFor(ownerPid, rows);
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const controllers = controllerPids
    .map(pid => byPid.get(pid))
    .filter(Boolean)
    .map(processReceipt);
  let lease = createStorybookVitestLease({
    leaseDir: options.leaseDir,
    token,
    ownerPid,
    ownerPgid: ownerReceipt.pgid,
    ownerStartedAt: ownerReceipt.startedAt,
    ownerCommandHash: ownerReceipt.commandHash,
    deadlineAt: runMode ? Date.now() + timeoutMs : null,
    tempRoot,
    controllers,
  });

  if (!lease.created) {
    removeWorkDir(tempRoot);
    if (!sameProcessReceipt(owner, ownerReceiptFromLease(lease))) {
      throw new Error('Storybook Vitest owner token is already leased');
    }
    process.env.TMPDIR = lease.tempRoot;
    process.env.TMP = lease.tempRoot;
    process.env.TEMP = lease.tempRoot;
    lease = await ensureStorybookVitestWatchdog(lease);
    return {
      token,
      tempRoot: lease.tempRoot,
      leasePath: lease.leasePath,
      launchArg: `${STORYBOOK_VITEST_OWNER_ARG}${token}`,
    };
  }

  // Playwright asks os.tmpdir() for its ephemeral user-data directory. Giving
  // this run a private root makes the ownership check independently provable.
  process.env.TMPDIR = tempRoot;
  process.env.TMP = tempRoot;
  process.env.TEMP = tempRoot;
  lease = await ensureStorybookVitestWatchdog(lease);

  return {
    token,
    tempRoot,
    leasePath: lease.leasePath,
    launchArg: `${STORYBOOK_VITEST_OWNER_ARG}${token}`,
  };
}

export function createStorybookVitestOwnerToken() {
  return randomUUID();
}

function ownerTokenFromProject(project) {
  const args =
    project?.config?.browser?.provider?.options?.launchOptions?.args ?? [];
  const ownerArg = args.find(arg => arg.startsWith(STORYBOOK_VITEST_OWNER_ARG));
  const token = ownerArg?.slice(STORYBOOK_VITEST_OWNER_ARG.length);
  if (!isSafeToken(token)) {
    throw new Error(
      'Storybook Vitest Playwright provider is missing its owner token'
    );
  }
  return token;
}

export default async function setupStorybookVitestLifecycle(project) {
  // This supervisor relies on POSIX process groups. Keep the prior Playwright
  // behavior on Windows instead of making Storybook startup fail there.
  if (process.platform === 'win32') return;
  await startStorybookVitestLifecycle({
    token: ownerTokenFromProject(project),
    runMode: project?.vitest?.config?.watch !== true,
  });
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

if (process.argv[2] === STORYBOOK_VITEST_WATCHDOG_FLAG) {
  await runStorybookVitestWatchdog(process.argv[3]);
}
