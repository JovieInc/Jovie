/**
 * Canvas, WebGL, and video on marketing pages must be scoped, keep a
 * non-WebGL fallback, and honor prefers-reduced-motion. ASR-039: no motion
 * effect ships without a reduced-motion rest state, a static fallback and a
 * perf budget.
 *
 * Scopes live in docs/design-system/motion-effects.json. The homepage hero is
 * the approved scope (Tim, 2026-10-22); its static CSS poster is the default
 * and WebGL runs only when apps/web/data/marketing/animatedBackgroundBudget.ts
 * enables it. The hero shell zoom is the other scope (CSS transforms, no GL).
 * Every other hit stays on the shrink-only baseline.
 *
 * Per effect this checks: reduced-motion marker (group, plus each file the
 * registry names), fallback marker, offscreen pause and frame cap on GL files,
 * every registered file exists, and transpiled gzip within budget.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const SURFACE_BASELINE =
  'scripts/invariants/art-direction/surface-media.baseline.json';
export const MOTION_EFFECTS = 'docs/design-system/motion-effects.json';
export const HERO_SCOPE_PREFIX = 'apps/web/components/homepage/hero-light/';

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
const FALLBACK = /poster|renderer\s*!==\s*['"]webgl['"]|mountCanvas\s*\?/;

export function mediaKind(source) {
  if (!MEDIA.test(source)) return null;
  if (/<video\b/i.test(source)) return 'video';
  if (/webgl/i.test(source)) return 'webgl';
  return 'canvas';
}

const effectCache = new Map();

/** The registry, read once per root. Missing or unreadable is a hard error. */
export function loadEffects(repoRoot = REPO_ROOT) {
  if (!effectCache.has(repoRoot)) {
    effectCache.set(
      repoRoot,
      JSON.parse(readFileSync(join(repoRoot, MOTION_EFFECTS), 'utf8'))
    );
  }
  return effectCache.get(repoRoot);
}

const inEffect = (effect, file) =>
  effect.files.some(f => (f.endsWith('/') ? file.startsWith(f) : f === file));

export function scopeIdFor(file, registry = loadEffects()) {
  return registry.effects.find(effect => inEffect(effect, file))?.id ?? null;
}

const effectById = (id, registry = loadEffects()) =>
  registry.effects.find(effect => effect.id === id);

/** Unscoped media is a baseline id. Scoped media is judged with its scope. */
export function surfaceViolations(source, file, registry = loadEffects()) {
  const kind = mediaKind(source);
  if (!kind || scopeIdFor(file, registry)) return [];
  return [`${kind}:${file}`];
}

/**
 * @param {readonly { file: string, source: string }[]} entries
 * @returns {string[]}
 */
export function scopeViolations(entries, registry = loadEffects()) {
  /** @type {Map<string, { file: string, source: string }[]>} */
  const groups = new Map();
  for (const entry of entries) {
    const id = scopeIdFor(entry.file, registry);
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
    const effect = effectById(id, registry);
    if (
      !text.includes(effect?.reducedMotion?.marker ?? 'prefers-reduced-motion')
    ) {
      failures.push(`scope:${id}:missing-reduced-motion`);
    }
    const fallback = effect?.fallback ? new RegExp(effect.fallback) : FALLBACK;
    if (!fallback.test(text)) {
      failures.push(`scope:${id}:missing-non-webgl-fallback`);
    }
  }
  return failures;
}

/** A file that creates the GL context owns the pause and the frame cap. */
const CREATES_GL = /getContext\(\s*['"]webgl/;
const GL_PAUSE = /IntersectionObserver|visibilitychange/;
const FPS_CAP = /fpsCap|FRAME_INTERVAL|1000\s*\/\s*\d+/;
const BUDGETED = /\.[cm]?[jt]sx?$/;

/** Registry shape problems. A malformed registry must fail loud. */
export function registryProblems(registry) {
  /** @type {string[]} */
  const problems = [];
  if (registry?.schema !== 'jovie.motion-effects/v1') {
    return ['registry:schema must be jovie.motion-effects/v1'];
  }
  const ids = new Set();
  for (const effect of registry.effects ?? []) {
    const at = effect.id ?? '(no id)';
    if (!/^[a-z][a-z0-9-]+$/.test(effect.id ?? ''))
      problems.push(`registry:${at}:id`);
    if (ids.has(effect.id)) problems.push(`registry:${at}:duplicate-id`);
    ids.add(effect.id);
    if (!Array.isArray(effect.files) || effect.files.length === 0) {
      problems.push(`registry:${at}:files`);
    }
    try {
      new RegExp(effect.fallback);
    } catch {
      problems.push(`registry:${at}:fallback-not-a-regex`);
    }
    if (typeof effect.reducedMotion?.marker !== 'string') {
      problems.push(`registry:${at}:reduced-motion-marker`);
    }
    for (const file of effect.reducedMotion?.requiredIn ?? []) {
      if (!inEffect(effect, file))
        problems.push(`registry:${at}:required-in-outside-files:${file}`);
    }
    const b = effect.budget;
    if (!Number.isInteger(b?.gzipBytes) || b.gzipBytes <= 0) {
      problems.push(`registry:${at}:budget-gzipBytes`);
    }
    if (typeof b?.pausesOffscreen !== 'boolean')
      problems.push(`registry:${at}:budget-pausesOffscreen`);
    if (!(b?.fpsCap === null || Number.isFinite(b?.fpsCap)))
      problems.push(`registry:${at}:budget-fpsCap`);
  }
  return problems;
}

let transpiler;
function transpiledGzipBytes(source) {
  if (transpiler === undefined) {
    try {
      transpiler = createRequire(import.meta.url)('typescript');
    } catch {
      transpiler = null;
    }
  }
  if (!transpiler) return null;
  const { outputText } = transpiler.transpileModule(source, {
    compilerOptions: {
      jsx: transpiler.JsxEmit.ReactJSX,
      module: transpiler.ModuleKind.ESNext,
      removeComments: true,
      target: transpiler.ScriptTarget.ES2022,
    },
  });
  return gzipSync(outputText, { level: 9 }).byteLength;
}

/**
 * ASR-039 checks beyond scopeViolations: required reduced-motion files, GL
 * offscreen pause and frame cap, and the transpiled gzip budget.
 * @param {readonly { file: string, source: string }[]} entries
 * @returns {string[]}
 */
export function effectViolations(entries, registry = loadEffects()) {
  /** @type {string[]} */
  const failures = registryProblems(registry);
  for (const effect of registry.effects ?? []) {
    const group = entries.filter(entry => inEffect(effect, entry.file));
    const marker = effect.reducedMotion?.marker ?? 'prefers-reduced-motion';
    for (const file of effect.reducedMotion?.requiredIn ?? []) {
      const entry = group.find(e => e.file === file);
      if (entry && !entry.source.includes(marker)) {
        failures.push(`scope:${effect.id}:missing-reduced-motion-in:${file}`);
      }
    }
    for (const entry of group) {
      if (!CREATES_GL.test(entry.source)) continue;
      if (effect.budget.pausesOffscreen && !GL_PAUSE.test(entry.source)) {
        failures.push(
          `scope:${effect.id}:missing-offscreen-pause:${entry.file}`
        );
      }
      if (effect.budget.fpsCap && !FPS_CAP.test(entry.source)) {
        failures.push(`scope:${effect.id}:missing-fps-cap:${entry.file}`);
      }
    }
    let total = 0;
    for (const entry of group) {
      if (!BUDGETED.test(entry.file)) continue;
      const bytes = transpiledGzipBytes(entry.source);
      if (bytes === null) continue;
      total += bytes;
      const cap = effect.budget.perFileGzipBytes?.[entry.file];
      if (cap !== undefined && bytes > cap) {
        failures.push(
          `scope:${effect.id}:over-budget:${entry.file}:${bytes}>${cap}`
        );
      }
    }
    if (total > effect.budget.gzipBytes) {
      failures.push(
        `scope:${effect.id}:over-budget:${total}>${effect.budget.gzipBytes}`
      );
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
  const registry = loadEffects(repoRoot);
  /** @type {{ file: string, source: string }[]} */
  const scoped = [];
  /** @type {string[]} */
  const ids = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    const source = readFileSync(file, 'utf8');
    if (scopeIdFor(rel, registry)) scoped.push({ file: rel, source });
    ids.push(...surfaceViolations(source, rel, registry));
  }
  ids.sort();
  const scopeFailures = [
    ...scopeViolations(scoped, registry),
    ...effectViolations(scoped, registry),
  ];
  for (const effect of registry.effects ?? []) {
    for (const file of effect.files) {
      if (!existsSync(join(repoRoot, file))) {
        scopeFailures.push(`scope:${effect.id}:file-missing:${file}`);
      }
    }
  }
  return { ids, scopeFailures };
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
