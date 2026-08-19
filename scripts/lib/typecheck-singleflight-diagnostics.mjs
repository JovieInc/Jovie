/**
 * Non-destructive typecheck-singleflight phase/heartbeat diagnostics.
 *
 * These helpers only read process and filesystem metadata. They must never
 * signal a live compiler (no kill except the existing lock-liveness SIG 0)
 * and they must not influence lock recovery.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { sanitizeLogValue } from './typecheck-singleflight-lock.mjs';

const DEFAULT_CLK_TCK = 100;
const PROC_STAT_UTIME_INDEX = 11;
const PROC_STAT_STIME_INDEX = 12;
const PROC_STAT_STARTTIME_INDEX = 19;

/**
 * @typedef {object} TsBuildInfoStats
 * @property {string | null} path
 * @property {number | null} ageMs
 * @property {number | null} bytes
 */

/**
 * @typedef {object} ChildResourceStats
 * @property {number | null} cpuPct
 * @property {number | null} rssKb
 */

/**
 * @typedef {object} TypecheckDiagnostic
 * @property {string} phase
 * @property {'owner' | 'waiter'} role
 * @property {number} elapsedMs
 * @property {number | null} [pid]
 * @property {number | null} [childPid]
 * @property {number | null} [ownerPid]
 * @property {boolean | null} [ownerAlive]
 * @property {number | null} [lockAgeMs]
 * @property {number | null} [cpuPct]
 * @property {number | null} [rssKb]
 * @property {string | null} [tsbuildinfoPath]
 * @property {number | null} [tsbuildinfoAgeMs]
 * @property {number | null} [tsbuildinfoBytes]
 * @property {number | null} [exitCode]
 * @property {string | null} [command]
 * @property {string | null} [cwd]
 */

/**
 * @param {string[]} command
 * @param {string} cwd
 * @param {{ readonly readFile?: typeof readFileSync }} [options]
 * @returns {string | null}
 */
export function resolveTsBuildInfoPath(command, cwd, options = {}) {
  if (!Array.isArray(command) || command.length === 0) {
    return null;
  }

  const fromFlag = readFlagValue(command, '--tsBuildInfoFile');
  if (fromFlag) {
    return resolve(cwd, fromFlag);
  }

  const project =
    readFlagValue(command, '-p') ?? readFlagValue(command, '--project');
  if (!project) {
    return null;
  }

  const tsconfigPath = resolve(cwd, project);
  const readFile = options.readFile ?? readFileSync;
  try {
    const text = readFile(tsconfigPath, 'utf8');
    const match = /"tsBuildInfoFile"\s*:\s*"([^"]+)"/.exec(text);
    if (match?.[1]) {
      return resolve(dirname(tsconfigPath), match[1]);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {string | null} path
 * @param {{
 *   readonly nowMs?: number;
 *   readonly stat?: typeof statSync;
 * }} [options]
 * @returns {TsBuildInfoStats}
 */
export function readTsBuildInfoStats(path, options = {}) {
  if (typeof path !== 'string' || path.length === 0) {
    return { path: null, ageMs: null, bytes: null };
  }

  const nowMs = options.nowMs ?? Date.now();
  const stat = options.stat ?? statSync;
  try {
    const info = stat(path);
    return {
      path,
      ageMs: Math.max(0, nowMs - Number(info.mtimeMs)),
      bytes: Number(info.size),
    };
  } catch {
    return { path, ageMs: null, bytes: null };
  }
}

/**
 * @param {number | null | undefined} pid
 * @param {{
 *   readonly readFile?: typeof readFileSync;
 *   readonly clkTck?: number;
 *   readonly nowMs?: number;
 * }} [options]
 * @returns {ChildResourceStats}
 */
export function readChildResourceStats(pid, options = {}) {
  const linux = readLinuxProcResourceStats(pid, options);
  if (linux) {
    return linux;
  }
  if (options.readFile) {
    return { cpuPct: null, rssKb: null };
  }
  return readPsResourceStats(pid);
}

/**
 * Read-only /proc sampling. Never signals the target pid.
 *
 * @param {number | null | undefined} pid
 * @param {{
 *   readonly readFile?: typeof readFileSync;
 *   readonly clkTck?: number;
 * }} [options]
 * @returns {ChildResourceStats | null}
 */
export function readLinuxProcResourceStats(pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  const readFile = options.readFile ?? readFileSync;
  const clkTck = options.clkTck ?? DEFAULT_CLK_TCK;

  let statText;
  let statusText;
  try {
    statText = readFile(`/proc/${pid}/stat`, 'utf8');
    statusText = readFile(`/proc/${pid}/status`, 'utf8');
  } catch {
    return null;
  }

  const rssKb = parseVmRssKb(statusText);
  const cpu = parseProcStatCpu(statText);
  if (!cpu) {
    return rssKb === null ? null : { cpuPct: null, rssKb };
  }

  let elapsedSec = null;
  try {
    const uptimeText = readFile('/proc/uptime', 'utf8');
    const uptimeSec = Number.parseFloat(uptimeText.split(/\s+/)[0] ?? '');
    if (Number.isFinite(uptimeSec) && clkTck > 0) {
      elapsedSec = uptimeSec - cpu.starttime / clkTck;
    }
  } catch {
    elapsedSec = null;
  }

  const cpuPct =
    elapsedSec !== null && elapsedSec > 0 && clkTck > 0
      ? (cpu.cpuTicks / clkTck / elapsedSec) * 100
      : null;

  return { cpuPct, rssKb };
}

/**
 * @param {string} stat
 * @returns {{ cpuTicks: number, starttime: number } | null}
 */
export function parseProcStatCpu(stat) {
  const start = stat.indexOf('(');
  const end = stat.lastIndexOf(')');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const rest = stat
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  const utime = Number(rest[PROC_STAT_UTIME_INDEX]);
  const stime = Number(rest[PROC_STAT_STIME_INDEX]);
  const starttime = Number(rest[PROC_STAT_STARTTIME_INDEX]);
  if (![utime, stime, starttime].every(Number.isFinite)) {
    return null;
  }
  return { cpuTicks: utime + stime, starttime };
}

/**
 * @param {{
 *   readonly phase: string;
 *   readonly startedAtMs: number;
 *   readonly nowMs?: number;
 *   readonly childPid?: number | null;
 *   readonly command: string[] | string;
 *   readonly cwd: string;
 *   readonly pid?: number | null;
 *   readonly exitCode?: number | null;
 *   readonly readFile?: typeof readFileSync;
 *   readonly stat?: typeof statSync;
 *   readonly clkTck?: number;
 * }} input
 * @returns {TypecheckDiagnostic}
 */
export function collectOwnerDiagnostics(input) {
  const nowMs = input.nowMs ?? Date.now();
  const commandParts = Array.isArray(input.command)
    ? input.command
    : String(input.command).split(' ').filter(Boolean);
  const tsbuildinfo = readTsBuildInfoStats(
    resolveTsBuildInfoPath(commandParts, input.cwd, {
      readFile: input.readFile,
    }),
    { nowMs, stat: input.stat }
  );
  const resources = readChildResourceStats(input.childPid, {
    readFile: input.readFile,
    clkTck: input.clkTck,
  });

  return {
    phase: input.phase,
    role: 'owner',
    elapsedMs: Math.max(0, nowMs - input.startedAtMs),
    pid: input.pid ?? null,
    childPid: input.childPid ?? null,
    cpuPct: resources.cpuPct,
    rssKb: resources.rssKb,
    tsbuildinfoPath: tsbuildinfo.path,
    tsbuildinfoAgeMs: tsbuildinfo.ageMs,
    tsbuildinfoBytes: tsbuildinfo.bytes,
    exitCode: input.exitCode ?? null,
    command: Array.isArray(input.command)
      ? input.command.join(' ')
      : String(input.command),
    cwd: input.cwd,
  };
}

/**
 * @param {{
 *   readonly phase: string;
 *   readonly startedAtMs: number;
 *   readonly nowMs?: number;
 *   readonly ownerPid?: number | null;
 *   readonly ownerAlive?: boolean | null;
 *   readonly lockAgeMs?: number | null;
 *   readonly command: string[] | string;
 * }} input
 * @returns {TypecheckDiagnostic}
 */
export function collectWaitDiagnostics(input) {
  const nowMs = input.nowMs ?? Date.now();
  return {
    phase: input.phase,
    role: 'waiter',
    elapsedMs: Math.max(0, nowMs - input.startedAtMs),
    ownerPid: input.ownerPid ?? null,
    ownerAlive: input.ownerAlive ?? null,
    lockAgeMs: input.lockAgeMs ?? null,
    command: Array.isArray(input.command)
      ? input.command.join(' ')
      : String(input.command),
  };
}

/**
 * @param {TypecheckDiagnostic} diagnostic
 * @returns {string}
 */
export function formatDiagnosticLogLine(diagnostic) {
  const parts = [
    `[typecheck-singleflight] phase=${diagnostic.phase}`,
    `role=${diagnostic.role}`,
    `elapsedMs=${Math.max(0, Math.round(diagnostic.elapsedMs ?? 0))}`,
  ];

  if (diagnostic.role === 'owner') {
    parts.push(`pid=${formatNa(diagnostic.pid)}`);
    if (diagnostic.phase !== 'acquire') {
      parts.push(`childPid=${formatNa(diagnostic.childPid)}`);
      parts.push(`cpuPct=${formatCpu(diagnostic.cpuPct)}`);
      parts.push(`rssKb=${formatNa(diagnostic.rssKb)}`);
    }
    parts.push(
      `tsbuildinfo=${formatNa(formatDisplayPath(diagnostic.tsbuildinfoPath, diagnostic.cwd))}`
    );
    parts.push(
      `tsbuildinfoAgeMs=${formatNa(roundOrNull(diagnostic.tsbuildinfoAgeMs))}`
    );
    parts.push(`tsbuildinfoBytes=${formatNa(diagnostic.tsbuildinfoBytes)}`);
    if (diagnostic.exitCode != null) {
      parts.push(`exit=${diagnostic.exitCode}`);
    }
  } else {
    parts.push(`ownerPid=${formatNa(diagnostic.ownerPid)}`);
    parts.push(
      `ownerAlive=${
        diagnostic.ownerAlive == null
          ? 'n/a'
          : diagnostic.ownerAlive
            ? 'true'
            : 'false'
      }`
    );
    parts.push(`lockAgeMs=${formatNa(roundOrNull(diagnostic.lockAgeMs))}`);
  }

  if (diagnostic.command && diagnostic.phase !== 'heartbeat') {
    parts.push(`command=${sanitizeLogValue(diagnostic.command) ?? 'n/a'}`);
  }

  return parts.join(' ');
}

/**
 * @param {string[]} command
 * @param {string} flag
 * @returns {string | null}
 */
function readFlagValue(command, flag) {
  const equalsPrefix = `${flag}=`;
  for (let index = 0; index < command.length; index += 1) {
    const part = command[index];
    if (part === flag) {
      const value = command[index + 1];
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
    if (part.startsWith(equalsPrefix)) {
      const value = part.slice(equalsPrefix.length);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * @param {string} status
 * @returns {number | null}
 */
function parseVmRssKb(status) {
  const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
  if (!match) {
    return null;
  }
  const rssKb = Number(match[1]);
  return Number.isFinite(rssKb) ? rssKb : null;
}

/**
 * @param {number | null | undefined} pid
 * @returns {ChildResourceStats}
 */
function readPsResourceStats(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { cpuPct: null, rssKb: null };
  }

  const result = spawnSync(
    'ps',
    ['-p', String(pid), '-o', 'pcpu=', '-o', 'rss='],
    {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return { cpuPct: null, rssKb: null };
  }

  const parts = result.stdout.trim().split(/\s+/).filter(Boolean);
  const cpuPct = Number.parseFloat(parts[0] ?? '');
  const rssKb = Number.parseInt(parts[1] ?? '', 10);
  return {
    cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
    rssKb: Number.isInteger(rssKb) ? rssKb : null,
  };
}

/**
 * @param {string | null | undefined} path
 * @param {string | null | undefined} cwd
 * @returns {string | null}
 */
function formatDisplayPath(path, cwd) {
  if (typeof path !== 'string' || path.length === 0) {
    return null;
  }
  if (typeof cwd === 'string' && cwd.length > 0) {
    const rel = relative(cwd, path);
    if (rel && !rel.startsWith('..')) {
      return sanitizeLogValue(rel);
    }
  }
  return sanitizeLogValue(path);
}

/**
 * @param {number | null | undefined} value
 * @returns {number | null}
 */
function roundOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

/**
 * @param {number | null | undefined} value
 * @returns {string}
 */
function formatNa(value) {
  return value === null || value === undefined || value === ''
    ? 'n/a'
    : String(value);
}

/**
 * @param {number | null | undefined} value
 * @returns {string}
 */
function formatCpu(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(1)
    : 'n/a';
}
