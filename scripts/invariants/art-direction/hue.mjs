/**
 * No orange hues and no literal triad in marketing CSS or design.tokens.json.
 *
 * Orange is hue 18–48° at saturation ≥ 0.45 and lightness 0.15–0.92.
 * A literal triad is one CSS rule body that names Ion, Ultra, and Pulse.
 * imageColorPolicy.ts documents the ban and is not scanned.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HUE_BASELINE =
  'scripts/invariants/art-direction/hue.baseline.json';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = [
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
];
const EXTRA = ['design.tokens.json'];
const POLICY = 'apps/web/data/marketing/imageColorPolicy.ts';
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'storybook-static',
  'generated',
]);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
/** @type {ReadonlyArray<readonly [string, RegExp]>} */
const ROLE_SOURCE = [
  [
    'ultra',
    /--noir-ion-ultra\b|--color-accent-purple\b|data-accent\s*=\s*['"](?:ultra|purple)['"]/,
  ],
  [
    'pulse',
    /--noir-ion-pulse\b|--color-accent-pink\b|data-accent\s*=\s*['"](?:pulse|pink)['"]/,
  ],
  [
    'ion',
    /--color-accent-blue\b|--system-b-accent-cyan\b|data-accent\s*=\s*['"](?:ion|blue)['"]/,
  ],
];
const NAMED_ORANGE =
  /--color-accent-orange\b|--noir-ion-orange\b|--noir-ion-gold\b|data-accent\s*=\s*['"]orange['"]|\baccent:\s*['"]orange['"]/;
const ACCENT_HEX = {
  '#3faff3': 'ion',
  '#11afff': 'ion',
  '#a789f0': 'ultra',
  '#8e56f5': 'ultra',
  '#eb6ac6': 'pulse',
  '#f52bb5': 'pulse',
};

function normalizeHex(hex) {
  let body = String(hex).replace('#', '').trim();
  if (body.length === 3 || body.length === 4) {
    body = body
      .slice(0, 3)
      .split('')
      .map(char => char + char)
      .join('');
  } else if (body.length === 8) body = body.slice(0, 6);
  if (body.length !== 6 || /[^0-9a-f]/i.test(body)) return null;
  return `#${body.toLowerCase()}`;
}

function rgbToHsl(r, g, b) {
  const red = r / 255,
    green = g / 255,
    blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

export function isOrangeHex(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  const value = Number.parseInt(normalized.slice(1), 16);
  const { h, s, l } = rgbToHsl(
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255
  );
  return h >= 18 && h <= 48 && s >= 0.45 && l >= 0.15 && l <= 0.92;
}

function signals(source) {
  const roles = new Set();
  const oranges = [];
  for (const hex of source.match(
    /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
  ) ?? []) {
    const normalized = normalizeHex(hex);
    if (!normalized) continue;
    if (ACCENT_HEX[normalized]) roles.add(ACCENT_HEX[normalized]);
    else if (isOrangeHex(normalized)) oranges.push(normalized);
  }
  for (const [role, pattern] of ROLE_SOURCE) {
    if (pattern.test(source)) roles.add(role);
  }
  if (NAMED_ORANGE.test(source)) oranges.push('named:orange');
  return { roles: [...roles].sort(), oranges: [...new Set(oranges)] };
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
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
    return /\.(?:css|ts|tsx)$/.test(rel);
  });
}

export function hueViolations(source, file) {
  if (file === POLICY) return [];
  const text = stripComments(source);
  const ids = signals(text).oranges.map(orange => `orange:${file}:${orange}`);
  if (!file.endsWith('.css')) return ids;
  for (const match of text.matchAll(/\{[^{}]*\}/g)) {
    if (signals(match[0]).roles.length < 3) continue;
    const line = text.slice(0, match.index ?? 0).split('\n').length;
    ids.push(`triad:${file}:${line}`);
  }
  return ids;
}

export function scanHue(repoRoot = REPO_ROOT) {
  const ids = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    ids.push(...hueViolations(readFileSync(file, 'utf8'), rel));
  }
  for (const rel of EXTRA) {
    ids.push(...hueViolations(readFileSync(join(repoRoot, rel), 'utf8'), rel));
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

export const check = checkHue;

export function checkHue(repoRoot = REPO_ROOT, recordedIds) {
  const current = scanHue(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, HUE_BASELINE), 'utf8')).ids;
  const ancestor = ancestorIds(repoRoot, HUE_BASELINE);
  if (!ancestor.ok) return { failures: [ancestor.error], ids: current };
  return {
    failures: ratchet(current, recorded, ancestor.ancestor),
    ids: current,
  };
}
