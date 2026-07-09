#!/usr/bin/env node
/**
 * Design-token compiler (JOV #12009 wave 1 — pipeline scaffold).
 *
 * Reads the single machine-readable source `design/tokens.json` and emits:
 *   1. styles/generated/design-tokens.css          — one flat CSS namespace
 *   2. lib/design/generated/design-tokens.ts       — typed TS export
 *   3. lib/design/generated/design-tokens.manifest.json — agent manifest
 *
 * Build vs. Adopt: Style Dictionary was evaluated (issue names it). This is
 * ~120 lines of deterministic zero-dependency glue with no transforms; adopt
 * Style Dictionary in the namespace-collapse wave if transform complexity
 * grows (documented in design/tokens.json + PR body).
 *
 * Usage:
 *   node scripts/build-design-tokens.mjs           # write outputs
 *   node scripts/build-design-tokens.mjs --check   # exit 1 if outputs stale
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = join(WEB_ROOT, 'design', 'tokens.json');

export const OUTPUTS = {
  css: join(WEB_ROOT, 'styles', 'generated', 'design-tokens.css'),
  ts: join(WEB_ROOT, 'lib', 'design', 'generated', 'design-tokens.ts'),
  manifest: join(
    WEB_ROOT,
    'lib',
    'design',
    'generated',
    'design-tokens.manifest.json'
  ),
};

const HEADER =
  'GENERATED FILE — do not edit. Source: apps/web/design/tokens.json. Rebuild: pnpm --filter @jovie/web run tokens:build';

/** Strip `$`-prefixed metadata keys from a token group. */
function entries(group) {
  return Object.entries(group).filter(([key]) => !key.startsWith('$'));
}

export function loadSource() {
  return JSON.parse(readFileSync(SOURCE_PATH, 'utf8'));
}

/** @returns {{ css: string, ts: string, manifest: string }} */
export function generate(tokens = loadSource()) {
  // --- CSS: only tokens that are NET-NEW resolutions (gray scale). The
  // accent/radius/duration values stay emitted by design-system.css until the
  // namespace-collapse wave moves those definitions here; emitting them twice
  // would create cascade-order ambiguity.
  const grayVars = entries(tokens.gray)
    .map(([step, value]) => `  --gray${step}: ${value};`)
    .join('\n');
  const css = `/* ${HEADER} */\n:root {\n${grayVars}\n}\n`;

  // --- TS: full typed export of the source for programmatic consumers.
  const data = Object.fromEntries(
    Object.entries(tokens).filter(([key]) => !key.startsWith('$'))
  );
  const ts = `// ${HEADER}\nexport const DESIGN_TOKENS = ${JSON.stringify(
    data,
    null,
    2
  )} as const;\n\nexport type DesignTokens = typeof DESIGN_TOKENS;\n`;

  // --- Manifest: agent-readable index of canonical CSS custom properties.
  const manifestTokens = [];
  for (const [step, value] of entries(tokens.gray)) {
    manifestTokens.push({
      cssVar: `--gray${step}`,
      value,
      status: 'canonical',
      emittedBy: 'styles/generated/design-tokens.css',
    });
  }
  for (const mode of ['light', 'dark']) {
    for (const [name, value] of entries(tokens.accent[mode])) {
      manifestTokens.push({
        cssVar: `--color-accent-${name}`,
        mode,
        value,
        status: 'canonical',
        emittedBy: 'styles/design-system.css',
      });
    }
  }
  for (const [name, value] of entries(tokens.radius)) {
    manifestTokens.push({
      cssVar: `--radius-${name}`,
      value,
      status: 'canonical',
      emittedBy: 'styles/design-system.css',
    });
  }
  for (const [name, value] of entries(tokens.duration)) {
    manifestTokens.push({
      cssVar: `--linear-duration-${name}`,
      value,
      status: 'deprecated-alias',
      emittedBy: 'styles/linear-tokens.css',
      note: '--linear-* namespace is shrink-only ratcheted (linear-namespace-ratchet.test.ts)',
    });
  }
  const manifest = `${JSON.stringify(
    {
      $generated: HEADER,
      source: 'apps/web/design/tokens.json',
      divergences: tokens.divergences ?? {},
      tokens: manifestTokens,
    },
    null,
    2
  )}\n`;

  return { css, ts, manifest };
}

function writeOutputs({ css, ts, manifest }) {
  for (const path of Object.values(OUTPUTS)) {
    mkdirSync(dirname(path), { recursive: true });
  }
  writeFileSync(OUTPUTS.css, css);
  writeFileSync(OUTPUTS.ts, ts);
  writeFileSync(OUTPUTS.manifest, manifest);
}

/** @returns {string[]} paths that are stale/missing */
export function checkOutputs(generated = generate()) {
  const expected = {
    css: generated.css,
    ts: generated.ts,
    manifest: generated.manifest,
  };
  const stale = [];
  for (const [key, path] of Object.entries(OUTPUTS)) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== expected[key]) {
      stale.push(path);
    }
  }
  return stale;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const generated = generate();
  if (process.argv.includes('--check')) {
    const stale = checkOutputs(generated);
    if (stale.length > 0) {
      console.error(
        `Design-token outputs are stale:\n${stale.map(p => `  ${p}`).join('\n')}\nRun: pnpm --filter @jovie/web run tokens:build`
      );
      process.exit(1);
    }
    console.log('Design-token outputs are in sync.');
  } else {
    writeOutputs(generated);
    console.log('Design-token outputs written.');
  }
}
