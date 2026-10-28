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
  'feature.analytics': '--noir-ion-ion',
  'feature.conversion': '--noir-ion-ultra',
  'feature.beauty': '--noir-ion-pulse',
  'feature.links': '--noir-ion-aqua',
  'feature.speed': '--noir-ion-mint',
  'feature.pro': '--noir-ion-gold',
};

/** Parse custom-property anchors from the `:root.dark` block of the CSS.
 *  Light/global `:root` blocks are merged underneath (dark wins) so tokens
 *  the dark ladder references but does not override (e.g.
 *  --color-border-default) still resolve — JOV-8976 elevation export. */
export function loadAnchors(css = readFileSync(SOURCE_PATH, 'utf8')) {
  /** @type {string[]} */
  const blocks = [
    ...(css.match(/:root(?:\.dark)?(?:\s*,[^{]+)?\s*\{[\s\S]*?\n\}/g) ?? []),
  ];
  const darkBlock = blocks
    .filter(b => b.startsWith(':root.dark'))
    .find(b => b.includes('--noir-ion-canvas'));
  if (!darkBlock) {
    throw new Error(
      `No :root.dark block with --noir-ion-canvas found in ${SOURCE_PATH}`
    );
  }
  const anchors = {};
  for (const block of blocks) {
    if (block === darkBlock || block.startsWith(':root.dark')) continue;
    for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      anchors[match[1]] = match[2].trim();
    }
  }
  for (const match of darkBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    anchors[match[1]] = match[2].trim();
  }
  return anchors;
}

/** Resolve `var(--x)` chains against the merged anchors (depth-guarded). */
export function resolveVars(value, anchors, depth = 0) {
  if (depth > 6 || !value.includes('var(')) return value;
  return resolveVars(
    value.replace(/var\((--[\w-]+)\)/g, (ref, name) => anchors[name] ?? ref),
    anchors,
    depth + 1
  );
}

/** Elevation ladder (JOV-8976): level -> exported parts. L5 = modal + scrim. */
const ELEVATION_LEVELS = {
  0: ['surface', 'border', 'shadow'],
  1: ['surface', 'border', 'shadow'],
  2: ['surface', 'border', 'shadow'],
  3: ['surface', 'border', 'shadow'],
  4: ['surface', 'border', 'shadow'],
  5: ['surface', 'border', 'shadow', 'scrim'],
};
const ELEVATION_COLOR_PARTS = new Set(['surface', 'border', 'scrim']);

/** @returns {string} serialized design.tokens.json */
export function generate(anchors = loadAnchors()) {
  const color = {};
  for (const [tokenName, cssVar] of Object.entries(TOKEN_MAP)) {
    const value = anchors[cssVar];
    if (!value) {
      throw new Error(`Anchor ${cssVar} not found for token ${tokenName}`);
    }
    color[tokenName] = { $value: value, $type: 'color' };
  }
  const elevation = {};
  for (const [level, parts] of Object.entries(ELEVATION_LEVELS)) {
    elevation[level] = {};
    for (const part of parts) {
      const cssVar = `--elev-${level}-${part}`;
      const raw = anchors[cssVar];
      if (!raw) {
        throw new Error(
          `Anchor ${cssVar} not found for elevation.${level}.${part}`
        );
      }
      elevation[level][part] = {
        $value: resolveVars(raw, anchors),
        $type: ELEVATION_COLOR_PARTS.has(part) ? 'color' : 'shadow',
      };
    }
  }
  const doc = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    $version: 1,
    name: 'Jovie System B (Noir Ion)',
    $description:
      'Canonical Jovie design tokens, dark-first. Generated from the Noir Ion anchors and the JOV-8976 elevation ladder (--elev-0..5, L5 = modal + scrim) in apps/web/styles/design-system.css by scripts/generate-design-tokens-export.mjs — do not edit by hand. Rebuild: pnpm design:tokens:export. Used by importers (e.g. Magic Patterns) instead of scraping raw repo colors.',
    color,
    elevation,
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
