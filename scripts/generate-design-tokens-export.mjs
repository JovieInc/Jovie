#!/usr/bin/env node
/**
 * External design-token export generator (DTCG-ish, repo-root design.tokens.json).
 *
 * Reads the canonical Noir Ion anchors (`--noir-ion-*` in the `:root.dark`
 * block of apps/web/styles/design-system.css) and emits the repo-root
 * `design.tokens.json` consumed by external importers (e.g. Magic Patterns).
 * The CSS remains the source of truth; this file is a generated projection.
 *
 * Sibling of apps/web/scripts/build-design-tokens.mjs (which compiles the
 * in-app machine-readable source apps/web/design/tokens.json). This script is
 * the inverse direction: CSS anchors -> external export.
 *
 * Usage:
 *   pnpm design:tokens:export              # write design.tokens.json
 *   pnpm design:tokens:export:check        # exit 1 if the export is stale
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = join(
  REPO_ROOT,
  'apps',
  'web',
  'styles',
  'design-system.css'
);
const OUTPUT_PATH = join(REPO_ROOT, 'design.tokens.json');
const RADIUS_CSS_PATH = join(
  REPO_ROOT,
  'apps',
  'web',
  'styles',
  'generated',
  'design-tokens.css'
);
const TABLE_STYLES_PATH = join(
  REPO_ROOT,
  'apps',
  'web',
  'components',
  'organisms',
  'table',
  'table.styles.ts'
);

/**
 * Export token name -> Noir Ion anchor var in design-system.css.
 * Text tiers follow the product-token semantics documented in DESIGN.md
 * (Noir Ion table): tertiary = muted, quaternary = tertiary anchor.
 */
const TOKEN_MAP = {
  'surface.canvas': '--noir-ion-canvas',
  'surface.shell': '--noir-ion-shell',
  'surface.panel': '--noir-ion-card',
  'surface.card': '--noir-ion-card',
  'surface.elevated': '--noir-ion-elevated',
  'surface.floating': '--noir-ion-floating',
  'surface.glass': '--noir-ion-glass-surface',
  'surface.bgBase': '--noir-ion-canvas',
  'surface.bgPage': '--noir-ion-canvas',
  'surface.surface0': '--noir-ion-shell',
  // --color-bg-surface-1 = var(--noir-ion-card) (#131417).
  'surface.surface1': '--noir-ion-card',
  'surface.surface2': '--noir-ion-elevated',
  'surface.surface3': '--noir-ion-floating',
  'text.primary': '--noir-ion-text-primary',
  'text.secondary': '--noir-ion-text-secondary',
  'text.tertiary': '--noir-ion-text-muted',
  'text.quaternary': '--noir-ion-text-tertiary',
  'text.disabled': '--noir-ion-text-disabled',
  'border.subtle': '--noir-ion-border-subtle',
  'border.default': '--noir-ion-border-default',
  'border.strong': '--noir-ion-border-strong',
  'border.glass': '--noir-ion-glass-edge',
  'border.focus': '--noir-ion-ion',
  'accent.ion': '--noir-ion-ion',
  'accent.focusRing': '--noir-ion-focus-ring',
  'accent.selected': '--noir-ion-selected',
  'accent.ultra': '--noir-ion-ultra',
  'accent.pulse': '--noir-ion-pulse',
  'accent.aqua': '--noir-ion-aqua',
  'accent.mint': '--noir-ion-mint',
  'accent.gold': '--noir-ion-gold',
  'accent.flare': '--noir-ion-flare',
  'status.success': '--noir-ion-mint',
  'status.warning': '--noir-ion-gold',
  'status.error': '--noir-ion-flare',
};

/** Parse `--noir-ion-*` anchors from the `:root.dark` block of the CSS. */
export function loadAnchors(css = readFileSync(SOURCE_PATH, 'utf8')) {
  /** @type {string[]} */
  const blocks = [
    ...(css.match(/:root\.dark(?:\s*,[^{]+)?\s*\{[\s\S]*?\n\}/g) ?? []),
  ];
  const block = blocks.find(b => b.includes('--noir-ion-canvas'));
  if (!block) {
    throw new Error(
      `No :root.dark block with --noir-ion-canvas found in ${SOURCE_PATH}`
    );
  }
  const anchors = {};
  for (const match of block.matchAll(/(--noir-ion-[\w-]+):\s*([^;]+);/g)) {
    anchors[match[1]] = match[2].trim();
  }
  return anchors;
}

/** `1.25rem` / `12px` / `0` -> pixel number (16px root). Null when not a length. */
export function toPx(raw) {
  const text = String(raw).trim();
  if (text === '0') return 0;
  const match = text.match(/^(-?[\d.]+)(px|rem)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Math.round((match[2] === 'rem' ? n * 16 : n) * 100) / 100;
}

/**
 * First declaration of every `--<prefix>-*` custom property in `css`, as
 * { name-without-prefix: px }. Later redeclarations are ignored.
 */
export function loadScale(css, prefix) {
  /** @type {Record<string, number>} */
  const scale = {};
  const pattern = new RegExp(`^\\s*--${prefix}-([\\w-]+):\\s*([^;]+);`, 'gm');
  for (const match of css.matchAll(pattern)) {
    const px = toPx(match[2]);
    if (px !== null && !(match[1] in scale)) scale[match[1]] = px;
  }
  return scale;
}

/** TABLE_ROW_MODES + layoutStability.headerHeight from table.styles.ts. */
export function loadTableSizes(
  source = readFileSync(TABLE_STYLES_PATH, 'utf8')
) {
  const block = source.match(/TABLE_ROW_MODES\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!block) throw new Error('TABLE_ROW_MODES not found in table.styles.ts');
  /** @type {Record<string, {rowHeight: number, contentHeight: number}>} */
  const rowModes = {};
  for (const m of block[1].matchAll(
    /['"]?([\w-]+)['"]?:\s*\{\s*rowHeight:\s*(\d+),\s*contentHeight:\s*(\d+)\s*\}/g
  )) {
    rowModes[m[1]] = { rowHeight: Number(m[2]), contentHeight: Number(m[3]) };
  }
  if (Object.keys(rowModes).length === 0) {
    throw new Error('No row modes parsed from TABLE_ROW_MODES');
  }
  const header = source.match(/headerHeight:\s*'(\d+)px'/);
  if (!header) throw new Error('layoutStability.headerHeight not found');
  return { rowModes, headerHeight: Number(header[1]) };
}

const dimension = px => ({ $value: `${px}px`, $type: 'dimension' });

/** @returns {string} serialized design.tokens.json */
export function generate(
  anchors = loadAnchors(),
  css = readFileSync(SOURCE_PATH, 'utf8'),
  radiusCss = readFileSync(RADIUS_CSS_PATH, 'utf8'),
  tableSizes = loadTableSizes()
) {
  const color = {};
  for (const [tokenName, cssVar] of Object.entries(TOKEN_MAP)) {
    const value = anchors[cssVar];
    if (!value) {
      throw new Error(`Anchor ${cssVar} not found for token ${tokenName}`);
    }
    color[tokenName] = { $value: value, $type: 'color' };
  }
  const doc = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    $version: 1,
    name: 'Jovie System B (Noir Ion)',
    $description:
      'Canonical Jovie design tokens, dark-first. Generated from the Noir Ion anchors (--noir-ion-*) in apps/web/styles/design-system.css by scripts/generate-design-tokens-export.mjs — do not edit by hand. Rebuild: pnpm design:tokens:export. Used by importers (e.g. Magic Patterns) instead of scraping raw repo colors.',
    color,
    space: Object.fromEntries(
      Object.entries(loadScale(css, 'space')).map(([k, v]) => [k, dimension(v)])
    ),
    fontSize: Object.fromEntries(
      Object.entries(loadScale(css, 'text')).map(([k, v]) => [k, dimension(v)])
    ),
    radius: Object.fromEntries(
      Object.entries(loadScale(radiusCss, 'radius')).map(([k, v]) => [
        k,
        dimension(v),
      ])
    ),
    size: {
      headerHeight: dimension(tableSizes.headerHeight),
      ...Object.fromEntries(
        Object.entries(tableSizes.rowModes).flatMap(([mode, h]) => [
          [`row.${mode}`, dimension(h.rowHeight)],
          [`rowContent.${mode}`, dimension(h.contentHeight)],
        ])
      ),
    },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const generated = generate();
  if (process.argv.includes('--check')) {
    if (
      !existsSync(OUTPUT_PATH) ||
      readFileSync(OUTPUT_PATH, 'utf8') !== generated
    ) {
      console.error(
        `design.tokens.json is stale or missing.\nRun: pnpm design:tokens:export`
      );
      process.exit(1);
    }
    console.log('design.tokens.json is in sync with design-system.css.');
  } else {
    writeFileSync(OUTPUT_PATH, generated);
    console.log('design.tokens.json written.');
  }
}
