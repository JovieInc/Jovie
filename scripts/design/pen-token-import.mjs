#!/usr/bin/env node
/**
 * Generate the Pen import files from code tokens. One direction only:
 * design.tokens.json (from design-system.css) -> Pen variables.
 *
 *   node scripts/design/pen-token-import.mjs           # write both files
 *   node scripts/design/pen-token-import.mjs --check   # exit 1 when stale
 *
 * Outputs in docs/pen-stills/pen-import/:
 *   jovie-ds.variables.json   top-level `variables` object in the shape of a
 *                             .pen file, readable by pen-token-parity's
 *                             variableEntries(). Load it in Pen web.
 *   jovie-ds.components.json  row densities, header height and cell kinds from
 *                             code, to check the Pen "Jovie grid system" frames.
 * Never write Pen variables back into code tokens.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTableSizes } from '../generate-design-tokens-export.mjs';
import { parseColor } from '../invariants/pen-token-parity.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = join(REPO_ROOT, 'docs/pen-stills/pen-import');
export const VARIABLES_PATH = join(OUT_DIR, 'jovie-ds.variables.json');
export const COMPONENTS_PATH = join(OUT_DIR, 'jovie-ds.components.json');

const kebab = text =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\./g, '-')
    .toLowerCase();

/** Pen variable name for a token path such as `color.surface.card`. */
export function variableName(group, key, reverseAliases = {}) {
  const alias = reverseAliases[`${group}.${key}`];
  if (alias) return alias;
  const prefix = { fontSize: 'text', size: 'size' }[group] ?? group;
  return `atom-${prefix}-${kebab(key)}`;
}

const toHex = n =>
  Math.round(Math.min(1, Math.max(0, n)) * 255)
    .toString(16)
    .padStart(2, '0');

/** oklch(L% C H / A) -> #rrggbb[aa] (Pen has no oklch). Null if not oklch. */
export function oklchToHex(input) {
  const m = String(input).match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i
  );
  if (!m) return null;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const gamma = v => {
    const c2 = Math.min(1, Math.max(0, v));
    return c2 <= 0.0031308 ? 12.92 * c2 : 1.055 * c2 ** (1 / 2.4) - 0.055;
  };
  const alpha = m[5] === undefined ? 1 : Number(m[5]) / (m[6] ? 100 : 1);
  const hex = `#${lin.map(v => toHex(gamma(v))).join('')}`;
  return alpha >= 1 ? hex : `${hex}${toHex(alpha)}`;
}

/** Any token color -> hex Pen accepts. */
export function colorToHex(value) {
  const viaOklch = oklchToHex(value);
  if (viaOklch) return viaOklch;
  const c = parseColor(String(value));
  if (!c) throw new Error(`Unsupported color value: ${value}`);
  const hex = `#${toHex(c.r / 255)}${toHex(c.g / 255)}${toHex(c.b / 255)}`;
  return c.a >= 1 ? hex : `${hex}${toHex(c.a)}`;
}

const GROUPS = ['color', 'space', 'fontSize', 'radius', 'size'];

/**
 * @param {any} tokens parsed design.tokens.json
 * @param {Record<string, string>} aliases Pen name -> `color.*` token
 * @returns {{variables: object, names: Record<string, string>}}
 *   names maps Pen variable name -> token path (`group.key`).
 */
export function buildVariables(tokens, aliases = {}) {
  const reverse = Object.fromEntries(
    Object.entries(aliases).map(([penName, token]) => [token, penName])
  );
  const variables = {};
  const names = {};
  for (const group of GROUPS) {
    for (const [key, node] of Object.entries(tokens[group] ?? {})) {
      const name = variableName(group, key, reverse);
      if (name in variables) {
        throw new Error(`Duplicate Pen variable name ${name}`);
      }
      names[name] = `${group}.${key}`;
      if (node.$type === 'color') {
        variables[name] = {
          type: 'color',
          value: [{ value: colorToHex(node.$value), theme: { mode: 'dark' } }],
        };
      } else {
        const px = Number.parseFloat(node.$value);
        if (!Number.isFinite(px)) {
          throw new Error(`Bad dimension ${group}.${key}: ${node.$value}`);
        }
        variables[name] = { type: 'number', value: px };
      }
    }
  }
  return { variables, names };
}

/** Alias map covering every color variable, for round-trip parity. */
export function colorAliasesFor(names) {
  return Object.fromEntries(
    Object.entries(names).filter(([, token]) => token.startsWith('color.'))
  );
}

export function buildComponents(root = REPO_ROOT) {
  const { rowModes, headerHeight } = loadTableSizes();
  const cellsDir = join(root, 'apps/web/components/organisms/table/cells');
  const cellKinds = existsSync(cellsDir)
    ? readdirSync(cellsDir)
        .filter(
          f =>
            /\.tsx?$/.test(f) &&
            !/\.(test|stories|states\.stories)\.tsx?$/.test(f) &&
            !/^index\.tsx?$/.test(f)
        )
        .map(f => f.replace(/\.tsx?$/, ''))
        .sort()
    : [];
  return {
    schema: 'jovie-ds-components/v1',
    generatedBy: 'scripts/design/pen-token-import.mjs',
    note: 'Generated from code. Check the Pen "Jovie grid system" frames against this; do not edit by hand.',
    table: {
      headerHeight,
      rowModes,
      cellKinds,
      cellKindsSource: existsSync(cellsDir)
        ? 'apps/web/components/organisms/table/cells'
        : 'absent on this branch',
    },
  };
}

export function buildAll() {
  const tokens = JSON.parse(
    readFileSync(join(REPO_ROOT, 'design.tokens.json'), 'utf8')
  );
  const aliasDoc = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'docs/pen-stills/pen-variable-aliases.json'),
      'utf8'
    )
  );
  const { variables } = buildVariables(tokens, aliasDoc.aliases ?? {});
  const variablesDoc = {
    schema: 'jovie-ds-pen-import/v1',
    generatedBy: 'scripts/design/pen-token-import.mjs',
    note: 'Generated from design.tokens.json. Load in Pen web. Never edit Pen variables by hand; change code tokens and regenerate.',
    primaryMode: 'dark',
    variables,
  };
  return {
    [VARIABLES_PATH]: `${JSON.stringify(variablesDoc, null, 2)}\n`,
    [COMPONENTS_PATH]: `${JSON.stringify(buildComponents(), null, 2)}\n`,
  };
}

function main() {
  const outputs = buildAll();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(outputs).filter(
      ([path, text]) => !existsSync(path) || readFileSync(path, 'utf8') !== text
    );
    if (stale.length > 0) {
      for (const [path] of stale) {
        console.error(
          `${path.replace(`${REPO_ROOT}/`, '')} is stale or missing.`
        );
      }
      console.error('Run: pnpm design:pen-import');
      process.exit(1);
    }
    console.log('Pen import files are in sync with design.tokens.json.');
    return;
  }
  for (const [path, text] of Object.entries(outputs)) writeFileSync(path, text);
  console.log(`wrote ${Object.keys(outputs).length} Pen import files.`);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
