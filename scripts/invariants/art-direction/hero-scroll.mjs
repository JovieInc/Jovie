/**
 * Hero scroll stays native. Fail on wheel/touch preventDefault and on a
 * pinned dead zone (position fixed or sticky plus touch-action: none).
 * A hero file that drives scroll (a scroll listener, scroll timeline, or
 * keyframes) must mention prefers-reduced-motion.
 *
 * The homepage hero's zoom-out is native document scroll: a scroll-timeline
 * writes --hero-canvas-progress, and browsers without scroll timelines use a
 * passive scroll listener. Scrolling back reverses it. That pattern is not a
 * hijack. A WebGL requestAnimationFrame loop is not scroll.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERO_BASELINE =
  'scripts/invariants/art-direction/hero-scroll.baseline.json';
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
const SCROLL_MOTION =
  /addEventListener\(\s*['"](?:wheel|scroll|touchmove)['"]|animation-timeline|@keyframes|\banimation\s*:/;

export function heroViolations(source, file) {
  if (!/hero/i.test(file)) return [];
  const ids = [];
  const hijack =
    /addEventListener\(\s*['"](?:wheel|touch(?:start|move))['"][\s\S]{0,500}?preventDefault\s*\(/;
  const reactHijack =
    /on(?:Wheel|TouchMove|TouchStart)\s*=\s*\{[^}]*preventDefault\s*\(/;
  if (hijack.test(source) || reactHijack.test(source))
    ids.push(`scroll-hijack:${file}`);
  if (
    /position\s*:\s*(?:fixed|sticky)/.test(source) &&
    /touch-action\s*:\s*none/.test(source)
  ) {
    ids.push(`pinned-dead-zone:${file}`);
  }
  if (
    SCROLL_MOTION.test(source) &&
    !source.includes('prefers-reduced-motion')
  ) {
    ids.push(`reduced-motion:${file}`);
  }
  return ids;
}

function walk(repoRoot) {
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
    return /\.(?:css|ts|tsx|js|jsx)$/.test(rel);
  });
}

export function scanHero(repoRoot = REPO_ROOT) {
  const ids = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    ids.push(...heroViolations(readFileSync(file, 'utf8'), rel));
  }
  ids.sort();
  return ids;
}

function ancestorIds(repoRoot, relPath) {
  const rev = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (rev.status !== 0)
    return {
      ok: false,
      error:
        'origin/main is not available; the ratchet cannot prove it only shrinks',
    };
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
  const errors = [];
  const known = new Set(recorded);
  const live = new Set(current);
  const added = current.filter(id => !known.has(id));
  const removed = recorded.filter(id => !live.has(id));
  if (added.length)
    errors.push(
      `baseline is missing ${added.length} live id(s); do not add ids:\n${added.map(id => `  + ${id}`).join('\n')}`
    );
  if (removed.length)
    errors.push(
      `baseline can only shrink; delete ${removed.length} resolved id(s):\n${removed.map(id => `  - ${id}`).join('\n')}`
    );
  if (ancestor) {
    const grown = current.filter(id => !new Set(ancestor).has(id));
    if (grown.length)
      errors.push(
        `new violations are not allowed (${grown.length}):\n${grown.map(id => `  + ${id}`).join('\n')}`
      );
  }
  return errors;
}

export const check = checkHero;

export function checkHero(repoRoot = REPO_ROOT, recordedIds) {
  const current = scanHero(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, HERO_BASELINE), 'utf8')).ids;
  const ancestor = ancestorIds(repoRoot, HERO_BASELINE);
  if (!ancestor.ok) return { failures: [ancestor.error], ids: current };
  return {
    failures: ratchet(current, recorded, ancestor.ancestor),
    ids: current,
  };
}
