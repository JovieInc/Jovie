/**
 * Canvas, WebGL, and video on marketing pages must be scoped, keep a
 * non-WebGL fallback, and honor prefers-reduced-motion.
 *
 * The homepage hero is the approved scope (Tim, 2026-10-22). It ships
 * without a feature flag. The ambient field is the other scope: it already
 * keeps a CSS poster and declines WebGL under reduced motion. Every other
 * hit stays on the shrink-only baseline. There is no flag to leave off.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SURFACE_BASELINE =
  'scripts/invariants/art-direction/surface-media.baseline.json';
export const HERO_SCOPE_PREFIX = 'apps/web/components/homepage/hero-light/';
export const AMBIENT_SCOPE_ID = 'marketing-ambient-field';
export const AMBIENT_SCOPE_FILES = Object.freeze([
  'apps/web/components/marketing/motion/MarketingAmbientField.tsx',
  'apps/web/components/marketing/motion/ambient-field-gl.ts',
]);

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = [
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'storybook-static',
  'generated',
]);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.(?:css|ts|tsx|js|jsx)$/;
const MEDIA =
  /<canvas\b|<video\b|getContext\(\s*['"]webgl|WebGL2RenderingContext|webgl2/i;
const FALLBACK =
  /poster|shouldRunAmbientField|renderer\s*!==\s*['"]webgl['"]|mountCanvas\s*\?/;

export function mediaKind(source) {
  if (!MEDIA.test(source)) return null;
  if (/<video\b/i.test(source)) return 'video';
  if (/webgl/i.test(source)) return 'webgl';
  return 'canvas';
}

export function scopeIdFor(file) {
  if (file.startsWith(HERO_SCOPE_PREFIX)) return 'homepage-hero';
  if (AMBIENT_SCOPE_FILES.includes(file)) return AMBIENT_SCOPE_ID;
  return null;
}

/** Unscoped media is a baseline id. Scoped media is judged with its scope. */
export function surfaceViolations(source, file) {
  const kind = mediaKind(source);
  if (!kind || scopeIdFor(file)) return [];
  return [`${kind}:${file}`];
}

/**
 * @param {readonly { file: string, source: string }[]} entries
 * @returns {string[]}
 */
export function scopeViolations(entries) {
  /** @type {Map<string, { file: string, source: string }[]>} */
  const groups = new Map();
  for (const entry of entries) {
    const id = scopeIdFor(entry.file);
    if (!id) continue;
    const group = groups.get(id) ?? [];
    group.push(entry);
    groups.set(id, group);
  }
  /** @type {string[]} */
  const failures = [];
  for (const [id, group] of groups) {
    if (!group.some(entry => mediaKind(entry.source))) continue;
    const text = group.map(entry => entry.source).join('\n');
    if (!text.includes('prefers-reduced-motion')) {
      failures.push(`scope:${id}:missing-reduced-motion`);
    }
    if (!FALLBACK.test(text)) {
      failures.push(`scope:${id}:missing-non-webgl-fallback`);
    }
  }
  return failures;
}

function walk(repoRoot) {
  /** @type {string[]} */
  const files = [];
  const visit = absolute => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isFile()) {
      files.push(absolute);
      return;
    }
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
    return SOURCE_FILE.test(rel);
  });
}

export function scanSurface(repoRoot = REPO_ROOT) {
  /** @type {{ file: string, source: string }[]} */
  const scoped = [];
  /** @type {string[]} */
  const ids = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    const source = readFileSync(file, 'utf8');
    if (scopeIdFor(rel)) scoped.push({ file: rel, source });
    ids.push(...surfaceViolations(source, rel));
  }
  ids.sort();
  return { ids, scopeFailures: scopeViolations(scoped) };
}

function ancestorIds(repoRoot, relPath) {
  const rev = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (rev.status !== 0) {
    return {
      ok: false,
      error:
        'origin/main is not available; the ratchet cannot prove it only shrinks',
    };
  }
  const spec = `origin/main:${relPath}`;
  if (
    spawnSync('git', ['cat-file', '-e', spec], { cwd: repoRoot }).status !== 0
  ) {
    return { ok: true, ancestor: null };
  }
  const show = spawnSync('git', ['show', spec], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (show.status !== 0) return { ok: false, error: `unable to read ${spec}` };
  return { ok: true, ancestor: JSON.parse(show.stdout).ids };
}

function ratchet(current, recorded, ancestor) {
  /** @type {string[]} */
  const errors = [];
  const known = new Set(recorded);
  const live = new Set(current);
  const added = current.filter(id => !known.has(id));
  const removed = recorded.filter(id => !live.has(id));
  if (added.length) {
    errors.push(
      `baseline is missing ${added.length} live id(s); do not add ids:\n${added
        .map(id => `  + ${id}`)
        .join('\n')}`
    );
  }
  if (removed.length) {
    errors.push(
      `baseline can only shrink; delete ${removed.length} resolved id(s):\n${removed
        .map(id => `  - ${id}`)
        .join('\n')}`
    );
  }
  if (ancestor) {
    const ancestorSet = new Set(ancestor);
    const grown = current.filter(id => !ancestorSet.has(id));
    if (grown.length) {
      errors.push(
        `new violations are not allowed (${grown.length}):\n${grown
          .map(id => `  + ${id}`)
          .join('\n')}`
      );
    }
  }
  return errors;
}

export const check = checkSurface;

export function checkSurface(repoRoot = REPO_ROOT, recordedIds) {
  const { ids, scopeFailures } = scanSurface(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, SURFACE_BASELINE), 'utf8')).ids;
  const ancestor = ancestorIds(repoRoot, SURFACE_BASELINE);
  /** @type {string[]} */
  const failures = [...scopeFailures];
  if (!ancestor.ok) failures.push(ancestor.error);
  else failures.push(...ratchet(ids, recorded, ancestor.ancestor));
  return { failures, ids };
}
