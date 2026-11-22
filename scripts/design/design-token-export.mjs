#!/usr/bin/env node
/**
 * Export code tokens as Figma variables (W3C DTCG JSON), one file per mode.
 * One direction only: apps/web/styles/design-system.css -> Figma.
 *
 *   node scripts/design/design-token-export.mjs           # write both files
 *   node scripts/design/design-token-export.mjs --check   # exit 1 when stale,
 *                                                         # off-palette, or the
 *                                                         # Figma snapshot drifts
 *
 * Outputs in docs/design/figma/:
 *   light.tokens.json, dark.tokens.json   import both with Figma's Variables
 *                                         import (one mode each)
 *   figma-variables.snapshot.json         committed by agents via the Figma MCP;
 *                                         CI compares it to this export
 *
 * The exported color palette is the semantic set only. Its list comes from
 * apps/web/design/ziawi-color-sot.json (5 elevations, 6 accents) plus the text
 * and border roles below. Aliases, brand-accent synonyms and feature colors
 * stay internal and are never exported.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CSS_PATH = join(REPO_ROOT, 'apps/web/styles/design-system.css');
const ZIAWI_PATH = join(REPO_ROOT, 'apps/web/design/ziawi-color-sot.json');
const TOKENS_PATH = join(REPO_ROOT, 'design.tokens.json');
const OUT_DIR = join(REPO_ROOT, 'docs/design/figma');
export const SNAPSHOT_PATH = join(OUT_DIR, 'figma-variables.snapshot.json');
export const MODES = /** @type {const} */ (['light', 'dark']);
export const FILE_FOR_MODE = {
  light: join(OUT_DIR, 'light.tokens.json'),
  dark: join(OUT_DIR, 'dark.tokens.json'),
};

/** Text and border roles in the approved palette (surfaces/accents come from ZiaWI). */
export const TEXT_ROLES = ['primary', 'secondary', 'tertiary', 'disabled'];
export const BORDER_ROLES = ['subtle', 'default', 'strong', 'focus'];

/**
 * Code token each approved color really comes from. `var` is resolved per
 * mode from design-system.css. Orange and red soft values live under their
 * gold and flare alias names in the CSS (same hex).
 */
const SOFT_VAR = {
  ion: '--noir-ion-ion-soft',
  ultra: '--noir-ion-ultra-soft',
  pulse: '--noir-ion-pulse-soft',
  mint: '--noir-ion-mint-soft',
  orange: '--noir-ion-gold-soft',
  red: '--noir-ion-flare-soft',
};
const ACCENT_VAR = {
  ion: '--noir-ion-ion',
  ultra: '--noir-ion-ultra',
  pulse: '--noir-ion-pulse',
  mint: '--noir-ion-mint',
  orange: '--noir-ion-orange',
  red: '--noir-ion-red',
};

/** @param {any} ziawi parsed ziawi-color-sot.json */
export function approvedPalette(ziawi) {
  const surfaces = ziawi.elevations.roles.map(r => `surface.${r}`);
  const text = TEXT_ROLES.map(r => `text.${r}`);
  const border = BORDER_ROLES.map(r => `border.${r}`);
  const accents = ziawi.accents.roles.flatMap(r => [
    `accent.${r}`,
    `accent.${r}-soft`,
  ]);
  return [...surfaces, ...text, ...border, ...accents];
}

/** @param {any} ziawi @returns {Record<string, string>} token name -> css var */
export function colorSources(ziawi) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const r of ziawi.elevations.roles)
    map[`surface.${r}`] = `--noir-ion-${r}`;
  for (const r of TEXT_ROLES) map[`text.${r}`] = `--color-text-${r}-token`;
  for (const r of BORDER_ROLES) map[`border.${r}`] = `--color-border-${r}`;
  for (const r of ziawi.accents.roles) {
    map[`accent.${r}`] = ACCENT_VAR[r];
    map[`accent.${r}-soft`] = SOFT_VAR[r];
  }
  return map;
}

/**
 * Fail when the exported palette holds a color that is not approved, or more
 * colors than the approved list allows.
 * @param {string[]} exported exported color token names
 * @param {string[]} approved approved color token names
 * @returns {string[]} problems, empty when fine
 */
export function paletteProblems(exported, approved) {
  const allowed = new Set(approved);
  const problems = exported
    .filter(name => !allowed.has(name))
    .map(name => `color "${name}" is not in the approved palette`);
  if (exported.length > approved.length) {
    problems.push(
      `palette exports ${exported.length} colors; the approved list allows ${approved.length}`
    );
  }
  return problems;
}

// ---------------------------------------------------------------- CSS reading

/** Top-level plain rules of a stylesheet: [{ selectors, body }]. */
export function topLevelRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {{selectors: string[], body: string}[]} */
  const rules = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ';' && depth === 0) {
      start = i + 1;
    } else if (ch === '{') {
      if (depth === 0) {
        selector = text.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (!selector.startsWith('@')) {
          rules.push({
            selectors: selector
              .split(',')
              .map(s => s.replace(/\s+/g, ' ').trim()),
            body: text.slice(start, i),
          });
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

const LIGHT_SELECTORS = new Set([':root', '[data-proof-theme]']);
const DARK_SELECTORS = new Set([
  ':root.dark',
  '[data-proof-theme="dark"]',
  '.dark',
]);

/**
 * Custom properties per mode. Light is every plain `:root` block in file
 * order; dark is light overlaid with the `.dark` blocks.
 * @returns {Record<'light'|'dark', Record<string, string>>}
 */
export function loadModeVars(css = readFileSync(CSS_PATH, 'utf8')) {
  /** @type {Record<string, string>} */
  const light = {};
  /** @type {Record<string, string>} */
  const darkOnly = {};
  for (const rule of topLevelRules(css)) {
    const isLight = rule.selectors.some(s => LIGHT_SELECTORS.has(s));
    const isDark = rule.selectors.some(s => DARK_SELECTORS.has(s));
    if (!isLight && !isDark) continue;
    const body = rule.body.replace(/\{[^{}]*\}/g, '');
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      (isDark ? darkOnly : light)[m[1]] = m[2].replace(/\s+/g, ' ').trim();
    }
  }
  return { light, dark: { ...light, ...darkOnly } };
}

/** Resolve `var(--x[, fallback])` references against a mode's variables. */
export function resolveVar(value, vars, depth = 0) {
  if (depth > 12) throw new Error(`var() cycle near ${value}`);
  const out = value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
    (_, name, fallback) => {
      const next = vars[name] ?? fallback;
      if (next === undefined) throw new Error(`Unresolved ${name}`);
      return resolveVar(next, vars, depth + 1);
    }
  );
  return out;
}

// -------------------------------------------------------------- color to hex

const to8 = n =>
  Math.round(Math.min(1, Math.max(0, n)) * 255)
    .toString(16)
    .padStart(2, '0');
const gamma = v => {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};
const pct = (s, scale = 1) =>
  s.endsWith('%') ? Number.parseFloat(s) / 100 : Number.parseFloat(s) / scale;
const rad = deg => (Number.parseFloat(deg) * Math.PI) / 180;
const withAlpha = (hex, alpha) => (alpha >= 1 ? hex : `${hex}${to8(alpha)}`);

/** Any color the token source uses -> #rrggbb[aa]. */
export function colorToHex(input) {
  const text = String(input).trim();
  const hex = text.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) return `#${hex[1].toLowerCase()}`;
  const rgb = text.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
  );
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    return withAlpha(
      `#${to8(Number(rgb[1]) / 255)}${to8(Number(rgb[2]) / 255)}${to8(Number(rgb[3]) / 255)}`,
      alpha
    );
  }
  const fn = text.match(
    /^(oklch|lch)\(\s*(\S+)\s+(\S+)\s+(\S+?)(?:deg)?\s*(?:\/\s*(\S+))?\s*\)$/i
  );
  if (!fn) throw new Error(`Unsupported color value: ${text}`);
  const alpha = fn[5] === undefined ? 1 : pct(fn[5]);
  const L = pct(fn[2]);
  const C = Number.parseFloat(fn[3]);
  const h = rad(fn[4]);
  /** @type {number[]} */
  let lin;
  if (fn[1].toLowerCase() === 'oklch') {
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  } else {
    // CSS lch() is CIE Lab on D50, L in 0..100.
    const Lc = L * 100;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const fy = (Lc + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const inv = t =>
      t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);
    const X = 0.96422 * inv(fx);
    const Y = inv(fy);
    const Z = 0.82521 * inv(fz);
    // Bradford D50 -> D65, then XYZ -> linear sRGB.
    const X65 = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z;
    const Y65 = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z;
    const Z65 = 0.0122982 * X - 0.020483 * Y + 1.3299098 * Z;
    lin = [
      3.2404542 * X65 - 1.5371385 * Y65 - 0.4985314 * Z65,
      -0.969266 * X65 + 1.8760108 * Y65 + 0.041556 * Z65,
      0.0556434 * X65 - 0.2040259 * Y65 + 1.0572252 * Z65,
    ];
  }
  return withAlpha(`#${lin.map(v => to8(gamma(v))).join('')}`, alpha);
}

// ------------------------------------------------------------------ building

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const lower = s => String(s).toLowerCase();

/** @param {any} ziawi @returns {Record<'light'|'dark', Record<string, string>>} */
export function buildColors(ziawi = readJson(ZIAWI_PATH), css) {
  const modeVars = loadModeVars(css);
  const sources = colorSources(ziawi);
  /** @type {Record<'light'|'dark', Record<string, string>>} */
  const out = { light: {}, dark: {} };
  for (const mode of MODES) {
    for (const [name, cssVar] of Object.entries(sources)) {
      const raw = modeVars[mode][cssVar];
      if (raw === undefined) throw new Error(`${cssVar} missing in ${mode}`);
      out[mode][name] = colorToHex(resolveVar(raw, modeVars[mode]));
    }
  }
  return out;
}

/** The CSS and ZiaWI must agree on elevations and accents. */
export function ziawiMismatches(ziawi, colors) {
  /** @type {string[]} */
  const problems = [];
  for (const mode of MODES) {
    for (const role of ziawi.elevations.roles) {
      const want = lower(ziawi.elevations[mode][role]);
      const got = colors[mode][`surface.${role}`];
      if (want !== got) {
        problems.push(`surface.${role} (${mode}): css ${got}, ZiaWI ${want}`);
      }
    }
    for (const role of ziawi.accents.roles) {
      const want = lower(ziawi.accents.hex[role]);
      const got = colors[mode][`accent.${role}`];
      if (want !== got) {
        problems.push(`accent.${role} (${mode}): css ${got}, ZiaWI ${want}`);
      }
    }
  }
  return problems;
}

/** Dimension tokens (px) from the code export, same in both modes. */
export function loadDimensions(tokens = readJson(TOKENS_PATH)) {
  /** @type {Record<string, string>} */
  const dims = {};
  const groups = {
    space: 'space',
    fontSize: 'text',
    radius: 'radius',
    size: 'size',
    grid: 'grid',
  };
  for (const [group, prefix] of Object.entries(groups)) {
    for (const [key, node] of Object.entries(tokens[group] ?? {})) {
      dims[`${prefix}.${key}`] = node.$value;
    }
  }
  return dims;
}

/** `{size.row.compact}` -> its px string in design.tokens.json; other values pass through. */
export function resolveDimension(value, tokens = readJson(TOKENS_PATH)) {
  const alias = String(value).match(/^\{([\w-]+)\.(.+)\}$/);
  if (!alias) return value;
  const target = tokens[alias[1]]?.[alias[2]];
  if (!target) throw new Error(`Unresolved token alias ${value}`);
  return resolveDimension(target.$value, tokens);
}

/** Nest `a.b.c` into DTCG groups. */
function setPath(root, dotted, leaf) {
  const parts = dotted.split('.');
  let node = root;
  for (const part of parts.slice(0, -1)) {
    node[part] ??= {};
    node = node[part];
  }
  node[parts.at(-1)] = leaf;
}

/** @returns {Record<string, string>} output path -> file text */
export function buildAll() {
  const ziawi = readJson(ZIAWI_PATH);
  const colors = buildColors(ziawi);
  const dims = loadDimensions();
  /** @type {Record<string, string>} */
  const files = {};
  for (const mode of MODES) {
    /** @type {Record<string, any>} */
    const doc = {
      $description: `Jovie design tokens, ${mode} mode, as Figma variables (W3C DTCG). Generated from apps/web/styles/design-system.css by scripts/design/design-token-export.mjs. Never edit by hand: change the code token and run pnpm design:tokens-export.`,
    };
    for (const [name, value] of Object.entries(colors[mode])) {
      setPath(doc, name, { $type: 'color', $value: value });
    }
    for (const [name, value] of Object.entries(dims)) {
      setPath(doc, name, { $type: 'dimension', $value: value });
    }
    files[FILE_FOR_MODE[mode]] = `${JSON.stringify(doc, null, 2)}\n`;
  }
  return files;
}

/** Flat `a/b/c` -> { type, values: {light, dark} } view of the export. */
export function flatExport() {
  const colors = buildColors();
  const dims = loadDimensions();
  /** @type {Record<string, {type: string, values: Record<string, string|number>}>} */
  const flat = {};
  for (const name of Object.keys(colors.light)) {
    flat[name.replace(/\./g, '/')] = {
      type: 'color',
      values: { light: colors.light[name], dark: colors.dark[name] },
    };
  }
  for (const [name, value] of Object.entries(dims)) {
    const px = Number.parseFloat(resolveDimension(value));
    flat[name.replace(/\./g, '/')] = {
      type: 'float',
      values: { light: px, dark: px },
    };
  }
  return flat;
}

/**
 * Compare the code export with the committed Figma snapshot.
 * @param {any} snapshot parsed figma-variables.snapshot.json
 * @param {ReturnType<typeof flatExport>} flat
 * @returns {{status: 'no-snapshot'|'in-sync'|'drift', findings: string[]}}
 */
export function compareSnapshot(snapshot, flat) {
  const vars = snapshot?.variables ?? {};
  if (!snapshot?.fileKey || Object.keys(vars).length === 0) {
    return { status: 'no-snapshot', findings: [] };
  }
  /** @type {string[]} */
  const findings = [];
  for (const [name, want] of Object.entries(flat)) {
    const got = vars[name];
    if (!got) {
      findings.push(`missing in Figma: ${name}`);
      continue;
    }
    for (const mode of MODES) {
      const a = lower(got.values?.[mode]);
      const b = lower(want.values[mode]);
      if (a !== b) findings.push(`${name} (${mode}): Figma ${a}, code ${b}`);
    }
  }
  for (const name of Object.keys(vars)) {
    if (!(name in flat)) findings.push(`in Figma, not in code export: ${name}`);
  }
  return { status: findings.length ? 'drift' : 'in-sync', findings };
}

function main() {
  const outputs = buildAll();
  if (!process.argv.includes('--check')) {
    for (const [path, text] of Object.entries(outputs))
      writeFileSync(path, text);
    console.log(`wrote ${Object.keys(outputs).length} Figma variable files.`);
    return;
  }
  /** @type {string[]} */
  const errors = [];
  const ziawi = readJson(ZIAWI_PATH);
  const colors = buildColors(ziawi);
  errors.push(
    ...paletteProblems(Object.keys(colors.light), approvedPalette(ziawi)),
    ...ziawiMismatches(ziawi, colors)
  );
  for (const [path, text] of Object.entries(outputs)) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      errors.push(`${path.replace(`${REPO_ROOT}/`, '')} is stale or missing`);
    }
  }
  const snapshot = existsSync(SNAPSHOT_PATH) ? readJson(SNAPSHOT_PATH) : null;
  const { status, findings } = compareSnapshot(snapshot, flatExport());
  if (status === 'drift') {
    errors.push(
      ...findings.map(f => `Figma snapshot drift: ${f}`),
      'Re-import the export into Figma, or refresh the snapshot through the Figma MCP'
    );
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error('Run: pnpm design:tokens-export');
    process.exit(1);
  }
  console.log(
    status === 'no-snapshot'
      ? 'Figma variable files are in sync with code tokens. No Figma snapshot yet; drift check skipped.'
      : 'Figma variable files and the Figma snapshot are in sync with code tokens.'
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
