#!/usr/bin/env node
/**
 * Canonical OKLCH palette + surface-elevation guard (JOV-5388).
 * Color hex authority is Pen node ZiaWI (ziawi-color-sot-v1).
 * Fail-closed: SoT projection, syntax, gamut, contrast, harmony, energy bands,
 * derived kinds, gradient stops, and live CSS / tokens.json projections.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contrastRatioOklch,
  hexEquals,
  hueDistance,
  interpolateOklch,
  isInSrgbGamut,
  isMonotonicLightness,
  oklchToHex,
  parseOklch,
} from './lib/oklch.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(THIS_DIR, '..');
export const PALETTE_PATH = 'apps/web/design/oklch-palette.json';
export const COLOR_SOT_PATH = 'apps/web/design/ziawi-color-sot.json';
export const DESIGN_SYSTEM_PATH = 'apps/web/styles/design-system.css';
export const TOKENS_JSON_PATH = 'apps/web/design/tokens.json';
export const DESIGN_MD_PATH = 'DESIGN.md';
export const SCHEMA = 'jovie.oklch-palette/v1';
export const COLOR_SOT_SCHEMA = 'ziawi-color-sot-v1';
const KINDS = new Set(['equal-step', 'symmetric-focal']);
const THEMES = /** @type {const} */ (['light', 'dark']);
const SURFACES = ['surface-0', 'surface-1', 'surface-2', 'surface-3'];
const ELEVATION_ROLES = ['canvas', 'shell', 'card', 'elevated', 'floating'];
const ACCENT_ROLES = ['ion', 'ultra', 'pulse', 'mint', 'orange', 'red'];
const SWATCH_TO_ELEVATION = {
  canvas: 'canvas',
  'surface-0': 'shell',
  'surface-1': 'card',
  'surface-2': 'elevated',
  'surface-3': 'floating',
};

/** @typedef {{ code: string, detail: string }} Issue */
/** @typedef {{ l: number, c: number, h: number, alpha?: number }} Oklch */
/** @typedef {{ css?: string, tokensJson?: unknown, designMd?: string, colorSot?: unknown }} PaletteSources */

/**
 * Pen node ZiaWI is the color SoT. Palette / CSS hexes must project it.
 * @param {unknown} sot
 * @param {Record<string, any>} swatches
 * @param {(code: string, detail: string) => void} add
 */
export function bindZiawiColorSot(sot, swatches, add) {
  if (!sot || typeof sot !== 'object' || Array.isArray(sot)) {
    add('color-sot', 'ziawi-color-sot-v1 must be an object');
    return;
  }
  const doc = /** @type {Record<string, any>} */ (sot);
  if (doc.schema !== COLOR_SOT_SCHEMA) {
    add('color-sot', `expected ${COLOR_SOT_SCHEMA}`);
  }
  if (doc.penNode !== 'ZiaWI') {
    add('color-sot', 'penNode must be ZiaWI');
  }
  const elevations = doc.elevations ?? {};
  if (elevations.count !== 5) {
    add('color-sot', 'exactly 5 elevations');
  }
  if (elevations.roles?.join(',') !== ELEVATION_ROLES.join(',')) {
    add(
      'color-sot',
      'elevation roles must be canvas/shell/card/elevated/floating'
    );
  }
  if ((elevations.retired ?? []).includes('panel') === false) {
    add('color-sot', 'panel must stay retired');
  }
  for (const theme of THEMES) {
    for (const role of ELEVATION_ROLES) {
      if (!elevations[theme]?.[role]) {
        add('color-sot', `missing ${theme} ${role}`);
      }
    }
  }
  const accents = doc.accents ?? {};
  if (accents.count !== 6 || accents.hex?.ion !== '#11AFFF') {
    add('color-sot', 'ion must be #11AFFF');
  }
  if (accents.roles?.join(',') !== ACCENT_ROLES.join(',')) {
    add('color-sot', 'accents must be ion/ultra/pulse/mint/orange/red');
  }
  if (!swatches || typeof swatches !== 'object') return;
  for (const [swatch, role] of Object.entries(SWATCH_TO_ELEVATION)) {
    for (const theme of THEMES) {
      const expected = elevations[theme]?.[role];
      const actual = swatches[swatch]?.[theme]?.hex;
      if (!expected || !actual || !hexEquals(actual, expected)) {
        add(
          'color-sot',
          `${swatch}.${theme} want ZiaWI ${expected} got ${actual ?? 'missing'}`
        );
      }
    }
  }
  for (const role of ACCENT_ROLES) {
    const expected = accents.hex?.[role];
    for (const theme of THEMES) {
      const actual = swatches[role]?.[theme]?.hex;
      if (!expected || !actual || !hexEquals(actual, expected)) {
        add(
          'color-sot',
          `${role}.${theme} want ZiaWI ${expected} got ${actual ?? 'missing'}`
        );
      }
    }
  }
  for (const [alias, target] of Object.entries(accents.aliases ?? {})) {
    if (!swatches[alias]) continue;
    const expected = accents.hex?.[target];
    for (const theme of THEMES) {
      const actual = swatches[alias]?.[theme]?.hex;
      if (!expected || !actual || !hexEquals(actual, expected)) {
        add(
          'color-sot',
          `${alias}.${theme} must alias ZiaWI ${target} ${expected}`
        );
      }
    }
  }
}

function readRepo(repoRoot, relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function declarationsFor(css, selector) {
  const blocks =
    css.match(/:root(?:\.dark)?(?:\s*,[^{]+)?\s*\{[\s\S]*?\n\}/g) ?? [];
  const map = new Map();
  for (const block of blocks) {
    if (!selector.test(block.slice(0, block.indexOf('{')))) continue;
    for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      map.set(match[1], match[2].trim());
    }
  }
  return map;
}

function bindHex(issues, decls, bindings, swatches, theme) {
  for (const [prop, name] of Object.entries(bindings ?? {})) {
    const expected = swatches[name]?.[theme]?.hex;
    const actual = decls.get(prop);
    if (!expected) {
      issues.push({
        code: 'css-binding',
        detail: `${theme} ${prop} → ${name}`,
      });
      continue;
    }
    if (!actual || !/^#/.test(actual) || !hexEquals(actual, expected)) {
      issues.push({
        code: 'css-binding',
        detail: `${theme} ${prop} want ${expected} got ${actual ?? 'missing'}`,
      });
    }
  }
}

/**
 * @param {unknown} palette
 * @param {string} [repoRoot]
 * @param {PaletteSources} [sources]
 * @returns {Issue[]}
 */
export function validateOklchPalette(
  palette,
  repoRoot = REPO_ROOT,
  sources = {}
) {
  /** @type {Issue[]} */
  const issues = [];
  const add = (code, detail) => issues.push({ code, detail });
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) {
    return [{ code: 'invalid-document', detail: 'palette must be an object' }];
  }
  const doc = /** @type {Record<string, any>} */ (palette);
  if (doc.schema !== SCHEMA) add('schema', `expected ${SCHEMA}`);
  const { success, warning, danger } = doc.semantics ?? {};
  if (success !== 'mint') add('semantics', `success must be mint`);
  if (warning !== 'orange') add('semantics', `warning must be orange`);
  if (danger !== 'red') add('semantics', `danger must be red`);

  const swatches = doc.swatches;
  if (!swatches || typeof swatches !== 'object') {
    add('structure', 'missing swatches');
    return issues;
  }
  if (doc.elevation?.tokens?.join(',') !== SURFACES.join(',')) {
    add('elevation-tokens', 'tokens must be surface-0..3 in order');
  }

  /** @type {Record<string, { light: Oklch, dark: Oklch }>} */
  const parsed = {};
  for (const [name, entry] of Object.entries(swatches)) {
    for (const theme of THEMES) {
      const sample = entry?.[theme];
      if (!sample?.oklch || !sample?.hex) {
        add('structure', `${name}.${theme} needs oklch + hex`);
        continue;
      }
      try {
        const oklch = parseOklch(sample.oklch);
        if (!isInSrgbGamut(oklch)) add('gamut', `${name}.${theme} out of sRGB`);
        const projected = oklchToHex(oklch);
        if (!hexEquals(projected, sample.hex)) {
          add('projection', `${name}.${theme} ${projected} vs ${sample.hex}`);
        }
        parsed[name] = parsed[name] ?? { light: oklch, dark: oklch };
        parsed[name][theme] = oklch;
      } catch (error) {
        add(
          'syntax',
          `${name}.${theme} ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }

  for (const token of SURFACES) {
    if (!parsed[token]) add('elevation-tokens', `missing ${token}`);
  }
  const darkSurfaces = SURFACES.map(n => parsed[n]?.dark).filter(Boolean);
  if (darkSurfaces.length === 4 && !isMonotonicLightness(darkSurfaces)) {
    add('elevation-monotonic', 'dark surface-0..3 L must be monotonic');
  }
  if (darkSurfaces.length === 4 && darkSurfaces[3].l <= darkSurfaces[0].l) {
    add('elevation-monotonic', 'dark surface-3 must be lighter than surface-0');
  }
  const lightSurfaces = SURFACES.map(n => parsed[n]?.light).filter(Boolean);
  if (lightSurfaces.length === 4 && !isMonotonicLightness(lightSurfaces)) {
    add('elevation-light', 'light surface-0..3 L must be monotonic');
  }
  if (lightSurfaces.length === 4 && lightSurfaces[3].l >= lightSurfaces[0].l) {
    add('elevation-light', 'light surface-3 must recede (darker) vs surface-0');
  }
  if (
    parsed.canvas?.light &&
    parsed['surface-0']?.light &&
    parsed.canvas.light.l <= parsed['surface-0'].light.l
  ) {
    add('elevation-light', 'light canvas must be lighter than surface-0');
  }
  if (
    parsed.canvas?.dark &&
    parsed['surface-0']?.dark &&
    parsed.canvas.dark.l >= parsed['surface-0'].dark.l
  ) {
    add('elevation-monotonic', 'dark canvas must be darker than surface-0');
  }

  const bands = doc.energyBands;
  if (bands?.policy?.equalLightnessTarget !== false) {
    add('energy-policy', 'equalLightnessTarget must be false');
  }
  if (bands?.policy?.pastelChromaCap !== false) {
    add('energy-policy', 'pastelChromaCap must be false');
  }
  if (bands?.dark && typeof bands.dark === 'object') {
    for (const [name, band] of Object.entries(bands.dark)) {
      if (band && typeof band === 'object' && 'cMax' in band) {
        add('energy-policy', `${name} must not set cMax`);
      }
      const color = parsed[name]?.dark;
      if (!color) {
        add('energy-band', `energy band ${name} has no dark swatch`);
        continue;
      }
      const [hueLo, hueHi] = band.hue ?? [];
      const [lLo, lHi] = band.l ?? [];
      if (color.h < hueLo || color.h > hueHi) {
        add('energy-band', `${name} hue ${color.h.toFixed(2)} not in band`);
      }
      if (color.l < lLo || color.l > lHi) {
        add('energy-band', `${name} L ${color.l.toFixed(4)} not in band`);
      }
      const floor = bands.policy?.chromaFloor ?? 0;
      if (color.c < floor) add('energy-band', `${name} chroma below floor`);
    }
    const darkLs = Object.keys(bands.dark)
      .map(n => parsed[n]?.dark?.l)
      .filter(n => typeof n === 'number');
    if (darkLs.length >= 2) {
      const spread = Math.max(...darkLs) - Math.min(...darkLs);
      const minSpread = bands.policy?.minLightnessSpread ?? 0.08;
      if (spread < minSpread)
        add('energy-policy', 'dark accent L spread too small');
    }
  }

  for (const role of ['mint', 'orange', 'red']) {
    if (!parsed[role]) add('semantics', `missing status swatch ${role}`);
  }
  if (parsed.mint && parsed.orange && parsed.red) {
    // Lock hexes place orange and red ~25° apart. Keep the 40° gate on
    // mint↔orange and mint↔red only; orange↔red is a Tim-decision item.
    for (const [a, b] of [
      ['mint', 'orange'],
      ['mint', 'red'],
    ]) {
      const dist = hueDistance(parsed[a].dark, parsed[b].dark);
      if (dist < 40)
        add('harmony', `${a}/${b} hue distance ${dist.toFixed(1)}°`);
    }
  }

  for (const derived of doc.derived ?? []) {
    if (!KINDS.has(derived.kind)) {
      add('derived-kind', `${derived.id} kind ${derived.kind} is not allowed`);
    }
    if (derived.kind === 'symmetric-focal' && !swatches[derived.focal]) {
      add('derived-focal', `${derived.id} focal is not a named swatch`);
    }
    if (derived.kind === 'equal-step') {
      if (!swatches[derived.from] || !swatches[derived.to]) {
        add('derived-endpoints', `${derived.id} endpoints must be named`);
      }
      if (typeof derived.t !== 'number' || derived.t < 0 || derived.t > 1) {
        add('derived-step', `${derived.id} t must be in [0, 1]`);
      }
      const theme = derived.theme ?? 'dark';
      if (parsed[derived.from]?.[theme] && parsed[derived.to]?.[theme]) {
        interpolateOklch(
          parsed[derived.from][theme],
          parsed[derived.to][theme],
          derived.t ?? 0
        );
      }
    }
  }

  for (const gradient of doc.gradients ?? []) {
    if (!KINDS.has(gradient.kind)) {
      add('gradient-kind', `${gradient.id} kind is not allowed`);
    }
    const endpoints = new Set(gradient.endpoints ?? []);
    if (gradient.focal) endpoints.add(gradient.focal);
    let lastAt = Number.NEGATIVE_INFINITY;
    for (const stop of gradient.stops ?? []) {
      if (typeof stop.at !== 'number' || stop.at < lastAt) {
        add('gradient-stops', `${gradient.id} rogue/reordered stop`);
      }
      lastAt = stop.at;
      if (!endpoints.has(stop.token) || !swatches[stop.token]) {
        add('gradient-stops', `${gradient.id} stop ${stop.token} undeclared`);
      }
    }
  }

  for (const pair of doc.contrastPairs ?? []) {
    for (const theme of pair.themes ?? THEMES) {
      const fg = parsed[pair.fg]?.[theme];
      const bg = parsed[pair.bg]?.[theme];
      if (!fg || !bg) {
        add('contrast', `${pair.name} missing ${theme} swatch`);
        continue;
      }
      const ratio = contrastRatioOklch(fg, bg);
      if (ratio < pair.minRatio) {
        add('contrast', `${pair.name} ${theme} ${ratio.toFixed(2)}`);
      }
    }
  }

  const colorSot =
    sources.colorSot ?? JSON.parse(readRepo(repoRoot, COLOR_SOT_PATH));
  if (doc.authority !== COLOR_SOT_SCHEMA) {
    add('color-sot', `palette authority must be ${COLOR_SOT_SCHEMA}`);
  }
  if (
    doc.colorSot?.penNode !== 'ZiaWI' ||
    doc.colorSot?.schema !== COLOR_SOT_SCHEMA
  ) {
    add('color-sot', 'palette must declare ZiaWI ziawi-color-sot-v1');
  }
  bindZiawiColorSot(colorSot, swatches, add);

  const css = sources.css ?? readRepo(repoRoot, DESIGN_SYSTEM_PATH);
  const bindings = doc.cssBindings ?? {};
  bindHex(
    issues,
    declarationsFor(css, /:root\.dark/),
    bindings.darkHex,
    swatches,
    'dark'
  );
  bindHex(
    issues,
    declarationsFor(css, /^:root\b(?!\.dark)/),
    bindings.lightHex,
    swatches,
    'light'
  );
  for (const [prop, target] of Object.entries(bindings.aliases ?? {})) {
    const pattern = new RegExp(
      `${prop.replaceAll('-', '\\-')}\\s*:\\s*var\\(${target.replaceAll('-', '\\-')}\\)`
    );
    if (!pattern.test(css))
      add('css-alias', `${prop} must alias var(${target})`);
  }
  for (const match of css.matchAll(
    /--color-(?:success|warning|error|danger)\s*:\s*(#[0-9a-f]{3,8})/gi
  )) {
    add('off-token', `raw ${match[0]} is not allowed`);
  }

  const tokensJson =
    sources.tokensJson ?? JSON.parse(readRepo(repoRoot, TOKENS_JSON_PATH));
  for (const [path, binding] of Object.entries(doc.tokensJsonBindings ?? {})) {
    const expected = swatches[binding.swatch]?.[binding.theme]?.hex;
    const actual = path.split('.').reduce((acc, key) => acc?.[key], tokensJson);
    if (
      !expected ||
      typeof actual !== 'string' ||
      !hexEquals(actual, expected)
    ) {
      add(
        'off-token',
        `tokens.json ${path} want ${expected} got ${String(actual)}`
      );
    }
  }

  const designMd = sources.designMd ?? readRepo(repoRoot, DESIGN_MD_PATH);
  if (
    !/Mint[^\n]*Success/i.test(designMd) &&
    !/Mint\s*=\s*success/i.test(designMd)
  ) {
    add('docs', 'DESIGN.md must lock Mint = success');
  }
  if (
    !/Orange[^\n]*Warning/i.test(designMd) &&
    !/Orange\s*=\s*warning/i.test(designMd)
  ) {
    add('docs', 'DESIGN.md must lock Orange = warning');
  }
  if (
    !/Red[^\n]*Danger/i.test(designMd) &&
    !/Red\s*=\s*danger/i.test(designMd)
  ) {
    add('docs', 'DESIGN.md must lock Red = danger');
  }
  if (/Gold\s*\|\s*`#FFC857`[^\n]*warning/i.test(designMd)) {
    add('docs', 'DESIGN.md still treats Gold as warning');
  }
  if (/Flare[^\n]*danger/i.test(designMd)) {
    add('docs', 'DESIGN.md still treats Flare as danger');
  }
  if (!/ZiaWI/.test(designMd) || !/ziawi-color-sot-v1/.test(designMd)) {
    add('docs', 'DESIGN.md must name Pen node ZiaWI as color SoT');
  }
  return issues;
}

export function runOklchPaletteGuard(repoRoot = REPO_ROOT) {
  return validateOklchPalette(
    JSON.parse(readRepo(repoRoot, PALETTE_PATH)),
    repoRoot
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const issues = runOklchPaletteGuard();
  if (issues.length > 0) {
    console.error(`oklch-palette-guard FAIL (${issues.length})`);
    for (const issue of issues)
      console.error(`  [${issue.code}] ${issue.detail}`);
    process.exit(1);
  }
  console.log('oklch-palette-guard PASS');
}
