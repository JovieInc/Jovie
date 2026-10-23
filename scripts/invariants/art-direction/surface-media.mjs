/**
 * Canvas, WebGL, and video stay off marketing surfaces unless the file names
 * NIGHT_DJ_HARMONY_V1. The flag module must default to false. This extends
 * performance-invariants-v1 and does not add a second budget tool.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SURFACE_BASELINE = 'scripts/invariants/art-direction/surface-media.baseline.json';
export const FLAG_MODULE = 'apps/web/lib/marketing/night-dj-harmony.ts';
export const FLAG_TOKEN = 'NIGHT_DJ_HARMONY_V1';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = [
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
];
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'coverage', 'storybook-static', 'generated',
]);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
const MEDIA = /<canvas\b|<video\b|getContext\(\s*['"]webgl|WebGL2RenderingContext|webgl2/i;

export function surfaceViolations(source, file) {
  if (!MEDIA.test(source)) return [];
  if (source.includes(FLAG_TOKEN)) return [];
  const kind = /<video\b/i.test(source) ? 'video' : /webgl/i.test(source) ? 'webgl' : 'canvas';
  return [`${kind}:${file}`];
}

export function flagDefaultOff(source) {
  return /NIGHT_DJ_HARMONY_V1_ENABLED\s*=\s*false/.test(source);
}

function walk(repoRoot) {
  const files = [];
  const visit = absolute => {
    let stats;
    try { stats = statSync(absolute); } catch { return; }
    if (stats.isFile()) { files.push(absolute); return; }
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(absolute)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      visit(join(absolute, entry));
    }
  };
  for (const root of ROOTS) visit(join(repoRoot, root));
  return files.filter(file => {
    const rel = relative(repoRoot, file).split('\\').join('/');
    if (SKIP_FILE.test(rel)) return false;
    return /\.(?:css|ts|tsx|js|jsx)$/.test(rel);
  });
}

export function scanSurface(repoRoot = REPO_ROOT) {
  const ids = [];
  const hard = [];
  let flagSource = '';
  try { flagSource = readFileSync(join(repoRoot, FLAG_MODULE), 'utf8'); }
  catch { hard.push(`missing-flag:${FLAG_MODULE}`); }
  if (flagSource && !flagDefaultOff(flagSource)) hard.push(`flag-default-on:${FLAG_MODULE}`);
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    ids.push(...surfaceViolations(readFileSync(file, 'utf8'), rel));
  }
  ids.sort();
  return { ids, hard };
}

function ancestorIds(repoRoot, relPath) {
  const rev = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: repoRoot, encoding: 'utf8',
  });
  if (rev.status !== 0) return { ok: false, error: 'origin/main is not available; the ratchet cannot prove it only shrinks' };
  const spec = `origin/main:${relPath}`;
  if (spawnSync('git', ['cat-file', '-e', spec], { cwd: repoRoot }).status !== 0) {
    return { ok: true, ancestor: null };
  }
  const show = spawnSync('git', ['show', spec], { cwd: repoRoot, encoding: 'utf8' });
  if (show.status !== 0) return { ok: false, error: `unable to read ${spec}` };
  return { ok: true, ancestor: JSON.parse(show.stdout).ids };
}

function ratchet(current, recorded, ancestor) {
  const errors = [];
  const known = new Set(recorded);
  const live = new Set(current);
  const added = current.filter(id => !known.has(id));
  const removed = recorded.filter(id => !live.has(id));
  if (added.length) errors.push(`baseline is missing ${added.length} live id(s); do not add ids:\n${added.map(id => `  + ${id}`).join('\n')}`);
  if (removed.length) errors.push(`baseline can only shrink; delete ${removed.length} resolved id(s):\n${removed.map(id => `  - ${id}`).join('\n')}`);
  if (ancestor) {
    const grown = current.filter(id => !new Set(ancestor).has(id));
    if (grown.length) errors.push(`new violations are not allowed (${grown.length}):\n${grown.map(id => `  + ${id}`).join('\n')}`);
  }
  return errors;
}

export const check = checkSurface;

export function checkSurface(repoRoot = REPO_ROOT, recordedIds) {
  const { ids, hard } = scanSurface(repoRoot);
  const recorded = recordedIds ?? JSON.parse(readFileSync(join(repoRoot, SURFACE_BASELINE), 'utf8')).ids;
  const ancestor = ancestorIds(repoRoot, SURFACE_BASELINE);
  const failures = [...hard];
  if (!ancestor.ok) failures.push(ancestor.error);
  else failures.push(...ratchet(ids, recorded, ancestor.ancestor));
  return { failures, ids };
}
