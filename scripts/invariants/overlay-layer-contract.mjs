#!/usr/bin/env node
/**
 * JOV-INV-039: overlay layer contract.
 *
 * Check class: overlay-collision
 *
 * Two halves:
 *   1. Contract (cheap, composed into scripts/invariants/validate.mjs): the
 *      semantic overlay z-index tokens in apps/web/styles/tailwind-foundation.css
 *      keep their order (banner < sheet < modal < popover < tooltip), and the
 *      canonical @jovie/ui primitives bind to those tokens instead of numbers.
 *   2. Raw z-index ratchet (web lane, `pnpm design:overlay-layers:check`):
 *      product source may not add global-layer magic numbers. Local stacking
 *      inside a component (Tailwind z-0..z-30, CSS z-index <= 30) stays legal;
 *      anything above that, every arbitrary `z-[...]`, and numeric inline
 *      `zIndex` values above 30 must use a semantic layer. Existing findings
 *      are grandfathered per file + value in the committed baseline and can
 *      only shrink.
 *
 * Runtime collision behavior (topmost paint order, Escape order, focus trap
 * and restore, scroll lock, submenu viewport fit, anchor unmount) is proven
 * by apps/web/tests/e2e/storybook-overlay-collisions.spec.ts.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const OVERLAY_LAYER_INVARIANT_ID = 'JOV-INV-039';
export const OVERLAY_LAYER_SCHEMA = 'jovie-overlay-layer-contract/v1';
export const OVERLAY_LAYER_CHECK_CLASS = 'overlay-collision';
export const BASELINE_SCHEMA = 'jovie.overlay-raw-z-index/v1';
export const BASELINE_PATH =
  'scripts/invariants/overlay-layer-contract.baseline.json';
export const CHECK_COMMAND = 'pnpm design:overlay-layers:check';
export const UPDATE_COMMAND = 'pnpm design:overlay-layers:update';
export const FIXTURE_ROOT =
  'scripts/invariants/fixtures/overlay-layer-contract';

/** Lowest to highest. A later layer always paints above an earlier one. */
export const LAYER_ORDER = Object.freeze([
  'banner',
  'sheet',
  'modal',
  'popover',
  'tooltip',
]);

/** Highest raw value that still counts as local stacking inside a component. */
export const LOCAL_STACKING_MAX = 30;

export const TOKEN_SOURCE = 'apps/web/styles/tailwind-foundation.css';

/**
 * Canonical primitive bindings: each file must contain each class token.
 * Kept to the shared sources so a primitive cannot drift back to a number.
 */
export const PRIMITIVE_BINDINGS = Object.freeze([
  {
    path: 'packages/ui/lib/overlay-styles.ts',
    tokens: [
      "'fixed inset-0 z-modal",
      'top-1/2 z-modal',
      "'z-sheet'",
      'fixed z-sheet',
    ],
  },
  {
    path: 'packages/ui/lib/dropdown-styles.ts',
    tokens: ['`z-popover min-w-48', "'z-popover min-w-48"],
  },
  { path: 'packages/ui/atoms/tooltip.tsx', tokens: ["'z-tooltip"] },
  { path: 'packages/ui/atoms/sheet.tsx', tokens: ['sheetOverlayClassName'] },
  {
    path: 'packages/ui/lib/utils.ts',
    tokens: LAYER_ORDER.map(layer => `'${layer}'`),
  },
]);

export const CONTRACT_SOURCES = Object.freeze([
  TOKEN_SOURCE,
  ...PRIMITIVE_BINDINGS.map(binding => binding.path),
]);

export const RATCHET_SCAN_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/components',
  'apps/web/hooks',
  'apps/web/lib',
  'apps/web/styles',
  'packages/ui',
]);

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE_EXT = new Set(['.ts', '.tsx', '.css']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'generated',
  'fixtures',
  'tests',
  '__tests__',
  'e2e',
  'storybook-static',
]);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;

const TAILWIND_ARBITRARY_Z = /(?<![\w-])-?z-\[([^\]]+)\]/g;
const TAILWIND_NUMERIC_Z = /(?<![\w-])-?z-(\d+)(?![\w-])/g;
const CSS_Z_INDEX = /(?<![\w-])z-index\s*:\s*(-?\d+)/g;
const INLINE_Z_INDEX = /\bzIndex\s*:\s*['"]?(-?\d+)/g;

function posix(path) {
  return path.split('\\').join('/');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:'"`])\/\/.*$/gm,
      (match, prefix) => `${prefix}${' '.repeat(match.length - prefix.length)}`
    );
}

/**
 * @param {string} relPath
 * @param {string} sourceText
 * @returns {Array<{ path: string, rule: string, value: string }>}
 */
export function scanRawZIndex(relPath, sourceText) {
  const source = stripComments(sourceText);
  const findings = [];
  const isCss = extname(relPath) === '.css';
  const push = (rule, value) => findings.push({ path: relPath, rule, value });

  if (!isCss) {
    for (const match of source.matchAll(TAILWIND_ARBITRARY_Z)) {
      if (/^var\(--z-index-/.test(match[1])) continue;
      push('arbitrary-z-class', `z-[${match[1]}]`);
    }
    for (const match of source.matchAll(TAILWIND_NUMERIC_Z)) {
      if (Number(match[1]) > LOCAL_STACKING_MAX) {
        push('global-layer-z-class', `z-${match[1]}`);
      }
    }
    for (const match of source.matchAll(INLINE_Z_INDEX)) {
      if (Math.abs(Number(match[1])) > LOCAL_STACKING_MAX) {
        push('inline-z-index', `zIndex:${match[1]}`);
      }
    }
  }
  for (const match of source.matchAll(CSS_Z_INDEX)) {
    if (Math.abs(Number(match[1])) > LOCAL_STACKING_MAX) {
      push('css-z-index', `z-index:${match[1]}`);
    }
  }
  return findings;
}

function walk(absDir, out) {
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        walk(join(absDir, entry.name), out);
      }
    } else if (
      SOURCE_EXT.has(extname(entry.name)) &&
      !SKIP_FILE.test(entry.name)
    ) {
      out.push(join(absDir, entry.name));
    }
  }
}

/** Collapse findings into shrink-only `file + value` identities. */
export function toIdentities(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.path}\u0000${finding.value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [file, value] = key.split('\u0000');
      return { file, value, count };
    })
    .sort((a, b) =>
      a.file === b.file
        ? a.value.localeCompare(b.value)
        : a.file.localeCompare(b.file)
    );
}

export function scanRatchetRoots(
  repoRoot = DEFAULT_ROOT,
  roots = RATCHET_SCAN_ROOTS
) {
  const files = [];
  for (const root of roots) walk(resolve(repoRoot, root), files);
  const findings = [];
  for (const abs of files.sort()) {
    const rel = posix(relative(repoRoot, abs));
    findings.push(...scanRawZIndex(rel, readFileSync(abs, 'utf8')));
  }
  return findings;
}

/** Baseline `files` map (`{ file: { value: count } }`) as identity rows. */
export function baselineIdentities(baseline) {
  return Object.entries(baseline?.files ?? {}).flatMap(([file, values]) =>
    Object.entries(values).map(([value, count]) => ({ file, value, count }))
  );
}

export function readBaseline(repoRoot = DEFAULT_ROOT) {
  const path = resolve(repoRoot, BASELINE_PATH);
  if (!existsSync(path)) return { schema: BASELINE_SCHEMA, files: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @returns {{ regressions: string[], shrinks: string[] }}
 */
export function compareToBaseline(identities, baseline) {
  const allowed = new Map(
    baselineIdentities(baseline).map(item => [
      `${item.file}\u0000${item.value}`,
      item.count,
    ])
  );
  const current = new Map(
    identities.map(item => [`${item.file}\u0000${item.value}`, item.count])
  );
  const regressions = [];
  const shrinks = [];
  for (const item of identities) {
    const limit = allowed.get(`${item.file}\u0000${item.value}`) ?? 0;
    if (item.count > limit) {
      regressions.push(
        `${item.file}: ${item.value} x${item.count} (baseline ${limit}) — use a semantic overlay layer (z-banner/z-sheet/z-modal/z-popover/z-tooltip) or local stacking <= z-${LOCAL_STACKING_MAX}`
      );
    }
  }
  for (const [key, count] of allowed) {
    const now = current.get(key) ?? 0;
    if (now < count) {
      const [file, value] = key.split('\u0000');
      shrinks.push(`${file}: ${value} ${count} -> ${now}`);
    }
  }
  return { regressions, shrinks };
}

/** Parse `--z-index-<layer>: <n>` tokens from the Tailwind theme source. */
export function parseLayerTokens(css) {
  const tokens = {};
  for (const match of css.matchAll(/--z-index-([a-z-]+)\s*:\s*(-?\d+)\s*;/g)) {
    tokens[match[1]] = Number(match[2]);
  }
  return tokens;
}

export function validateLayerOrder(tokens, order = LAYER_ORDER) {
  const errors = [];
  for (const layer of order) {
    if (!Number.isInteger(tokens[layer])) {
      errors.push(`missing overlay layer token --z-index-${layer}`);
    }
  }
  for (let index = 1; index < order.length; index += 1) {
    const lower = order[index - 1];
    const upper = order[index];
    if (
      Number.isInteger(tokens[lower]) &&
      Number.isInteger(tokens[upper]) &&
      tokens[upper] <= tokens[lower]
    ) {
      errors.push(
        `--z-index-${upper} (${tokens[upper]}) must paint above --z-index-${lower} (${tokens[lower]})`
      );
    }
  }
  return errors;
}

export function validatePrimitiveBindings(
  repoRoot = DEFAULT_ROOT,
  bindings = PRIMITIVE_BINDINGS
) {
  const errors = [];
  for (const binding of bindings) {
    const abs = resolve(repoRoot, binding.path);
    if (!existsSync(abs)) {
      errors.push(`missing overlay primitive source ${binding.path}`);
      continue;
    }
    const source = readFileSync(abs, 'utf8');
    for (const token of binding.tokens) {
      if (!source.includes(token)) {
        errors.push(`${binding.path} no longer binds ${token}`);
      }
    }
    for (const finding of scanRawZIndex(binding.path, source)) {
      errors.push(
        `${binding.path} uses raw ${finding.value}; overlay primitives bind semantic layers only`
      );
    }
  }
  return errors;
}

export function validateOverlayLayerPolicy(registry) {
  const invariant = registry?.invariants?.find(
    item => item.id === OVERLAY_LAYER_INVARIANT_ID
  );
  if (!invariant)
    return [`${OVERLAY_LAYER_INVARIANT_ID} is missing from the registry`];
  const policy = invariant.policy?.value ?? {};
  const errors = [];
  if (policy.schema !== OVERLAY_LAYER_SCHEMA) {
    errors.push(`policy schema must be ${OVERLAY_LAYER_SCHEMA}`);
  }
  if (policy.checkClass !== OVERLAY_LAYER_CHECK_CLASS) {
    errors.push(`checkClass must be ${OVERLAY_LAYER_CHECK_CLASS}`);
  }
  if (JSON.stringify(policy.layerOrder) !== JSON.stringify(LAYER_ORDER)) {
    errors.push(`policy layerOrder must be ${LAYER_ORDER.join(' < ')}`);
  }
  if (policy.localStackingMax !== LOCAL_STACKING_MAX) {
    errors.push(`policy localStackingMax must be ${LOCAL_STACKING_MAX}`);
  }
  const menu = policy.menuHierarchy;
  if (
    menu?.maxGroupActions !== 8 ||
    menu?.maxRootActions !== 12 ||
    menu?.maxSubmenuDepth !== 1 ||
    menu?.overflow !== 'searchable-chooser-no-truncation'
  ) {
    errors.push(
      'menuHierarchy must retain 8 actions per group, 12 at root, one submenu and a searchable chooser without truncation'
    );
  }
  return errors;
}

/** Cheap contract half, composed into scripts/invariants/validate.mjs. */
export function validateOverlayLayerContract(
  repoRoot = DEFAULT_ROOT,
  { registry = readInvariantRegistry(repoRoot) } = {}
) {
  const tokenPath = resolve(repoRoot, TOKEN_SOURCE);
  const tokenErrors = existsSync(tokenPath)
    ? validateLayerOrder(parseLayerTokens(readFileSync(tokenPath, 'utf8')))
    : [`missing ${TOKEN_SOURCE}`];
  const policy = registry.invariants.find(
    item => item.id === OVERLAY_LAYER_INVARIANT_ID
  )?.policy?.value;
  const menuSource = policy?.menuHierarchy?.source;
  const menuErrors = [];
  if (
    menuSource !== 'packages/ui/atoms/common-dropdown-utils.ts' ||
    !existsSync(resolve(repoRoot, menuSource))
  ) {
    menuErrors.push(
      'menuHierarchy must bind the canonical CommonDropdown owner'
    );
  } else {
    const source = readFileSync(resolve(repoRoot, menuSource), 'utf8');
    for (const [name, field] of [
      ['MENU_MAX_GROUP_ACTIONS', 'maxGroupActions'],
      ['MENU_MAX_ROOT_ACTIONS', 'maxRootActions'],
      ['MENU_MAX_SUBMENU_DEPTH', 'maxSubmenuDepth'],
    ]) {
      if (
        !new RegExp(
          `export const ${name} = ${policy.menuHierarchy[field]};`
        ).test(source)
      )
        menuErrors.push(`${name} drifted from the menu hierarchy contract`);
    }
  }
  return [
    ...validateOverlayLayerPolicy(registry),
    ...tokenErrors,
    ...validatePrimitiveBindings(repoRoot),
    ...menuErrors,
  ];
}

export function runRatchet(repoRoot = DEFAULT_ROOT) {
  const identities = toIdentities(scanRatchetRoots(repoRoot));
  return {
    identities,
    ...compareToBaseline(identities, readBaseline(repoRoot)),
  };
}

export function writeBaseline(repoRoot = DEFAULT_ROOT) {
  const identities = toIdentities(scanRatchetRoots(repoRoot));
  const baseline = {
    schema: BASELINE_SCHEMA,
    invariant: OVERLAY_LAYER_INVARIANT_ID,
    scope: [...RATCHET_SCAN_ROOTS],
    localStackingMax: LOCAL_STACKING_MAX,
    totalFindings: identities.reduce((sum, item) => sum + item.count, 0),
    files: identities.reduce((files, item) => {
      files[item.file] = { ...files[item.file], [item.value]: item.count };
      return files;
    }, {}),
  };
  writeFileSync(
    resolve(repoRoot, BASELINE_PATH),
    `${JSON.stringify(baseline, null, 2)}\n`
  );
  return baseline;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--update-baseline')) {
    const baseline = writeBaseline();
    process.stdout.write(
      `overlay-layer-contract baseline written: ${baseline.totalFindings} grandfathered raw z-index values\n`
    );
  } else {
    const contractErrors = validateOverlayLayerContract();
    const { regressions, shrinks } = runRatchet();
    for (const error of contractErrors) {
      process.stderr.write(`overlay-layer-contract: ${error}\n`);
    }
    for (const regression of regressions) {
      process.stderr.write(`overlay-raw-z-index: ${regression}\n`);
    }
    if (shrinks.length) {
      process.stdout.write(
        `overlay-raw-z-index: ${shrinks.length} grandfathered values removed; run ${UPDATE_COMMAND} to lock the shrink\n`
      );
    }
    if (contractErrors.length || regressions.length) {
      process.exitCode = 1;
    } else {
      process.stdout.write('overlay-layer-contract clean\n');
    }
  }
}
