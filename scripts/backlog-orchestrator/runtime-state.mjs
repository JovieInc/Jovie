/**
 * Runtime state for the no-LLM backlog control plane.
 *
 * In-tree writes to `.orchestrator-cache.json` dirty `~/jovie-triage-runtime`
 * and fail-close gem's OpenClaw cron (`jovie-control-plane-no-llm`). Cache and
 * shadow reports live outside the git tree. The tracked path is ignorable dirt
 * so a leftover host file cannot keep the plane dead.
 */

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const LEGACY_CACHE_BASENAME = '.orchestrator-cache.json';
export const LEGACY_REPORT_BASENAME = 'shadow-report-latest.txt';
export const LEGACY_CACHE_RELATIVE = `scripts/backlog-orchestrator/${LEGACY_CACHE_BASENAME}`;
export const LEGACY_REPORT_RELATIVE = `scripts/backlog-orchestrator/${LEGACY_REPORT_BASENAME}`;

export const IGNORABLE_RELATIVE_PATHS = Object.freeze([
  LEGACY_CACHE_RELATIVE,
  LEGACY_REPORT_RELATIVE,
]);

export function defaultRuntimeDir(env = process.env) {
  const cacheHome = env.XDG_CACHE_HOME?.trim();
  if (cacheHome) return resolve(cacheHome, 'jovie');
  const home = env.HOME?.trim() || homedir();
  return resolve(home, '.cache', 'jovie');
}

function resolveEnvPath(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  return isAbsolute(trimmed) ? trimmed : resolve(trimmed);
}

export function resolveCacheFile({
  env = process.env,
  orchestratorDir = __dirname,
} = {}) {
  return (
    resolveEnvPath(env.JOVIE_ORCHESTRATOR_CACHE) ||
    join(defaultRuntimeDir(env), LEGACY_CACHE_BASENAME)
  );
}

export function resolveReportFile({
  env = process.env,
  orchestratorDir = __dirname,
} = {}) {
  return (
    resolveEnvPath(env.JOVIE_ORCHESTRATOR_REPORT) ||
    join(defaultRuntimeDir(env), LEGACY_REPORT_BASENAME)
  );
}

export function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  return filePath;
}

export function isPathInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== '' && !rel.startsWith(`..${sep}`) && !rel.startsWith('..');
}

export function assertsOutsideGitTree(filePath, orchestratorDir = __dirname) {
  if (isPathInside(filePath, orchestratorDir)) {
    throw new Error(
      `runtime state must not be written inside ${orchestratorDir}: ${filePath}`
    );
  }
  return filePath;
}

export function porcelainPath(line) {
  const trimmed = String(line || '').replace(/\r$/, '');
  if (trimmed.length <= 3) return '';
  let path = trimmed.slice(3).trim();
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1).replace(/\\"/g, '"');
  }
  const renamed = path.split(' -> ');
  return renamed[renamed.length - 1].replace(/\\/g, '/');
}

export function classifyRuntimeDirt(porcelain, { extraIgnorable = [] } = {}) {
  const ignorable = new Set([...IGNORABLE_RELATIVE_PATHS, ...extraIgnorable]);
  const dirty = String(porcelain || '')
    .split('\n')
    .map(porcelainPath)
    .filter(Boolean);
  const ignorableDirty = dirty.filter(path => ignorable.has(path));
  const blocking = dirty.filter(path => !ignorable.has(path));
  return {
    dirty,
    ignorable: ignorableDirty,
    blocking,
    failClosed: blocking.length > 0,
  };
}

export function resolveTrackedCacheFile(orchestratorDir = __dirname) {
  return resolve(orchestratorDir, LEGACY_CACHE_BASENAME);
}

export function resolveTrackedReportFile(orchestratorDir = __dirname) {
  return resolve(orchestratorDir, LEGACY_REPORT_BASENAME);
}
