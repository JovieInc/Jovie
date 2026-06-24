// design-sync CSS builder for @jovie/ui.
//
// @jovie/ui is a source-only package: its atoms use Tailwind v4 utilities +
// design tokens that are only compiled by the app's pipeline (apps/web). This
// script reproduces that compile into a single static stylesheet pointed at by
// cfg.cssEntry, so the synced bundle renders with the real Jovie styling.
//
// - Compiles apps/web/app/globals.css with the app's own @tailwindcss/postcss
//   (resolved from apps/web/node_modules so @theme/@utility/@config all apply).
// - Rewrites `:root.dark` -> `:root:root` so the canonical dark "carbon" look is
//   the default (preview cards don't render as <html class="dark">; specificity
//   is preserved so dark rules still win over the light :root defaults).
// - Defines --font-inter / --font-satoshi statically (next/font injects these at
//   runtime in the app; @font-face for them ships via cfg.extraFonts -> fonts.css).
//
// Output: packages/ui/.ds-design-sync.css (gitignored; regenerated every sync).
// Re-run via cfg.buildCmd: `node .design-sync/build-css.mjs`

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const postcss = requireWeb('postcss');
const tailwind = requireWeb('@tailwindcss/postcss');

const globals = path.join(root, 'apps/web/app/globals.css');
const out = path.join(root, 'packages/ui/.ds-design-sync.css');

// Scope the scan to packages/ui only: disable Tailwind's project-wide auto
// source detection (source(none)) so it emits utilities for the atoms' classes
// alone, not the whole public app. The @theme/@utility blocks and token
// @imports in globals.css are preserved; globals.css already declares
// `@source "../../../packages/ui"`, which becomes the only scanned source.
const css = fs
  .readFileSync(globals, 'utf8')
  .replace(
    /@import\s+"tailwindcss"\s*;/,
    '@import "tailwindcss" source(none);'
  );
const result = await postcss([tailwind()]).process(css, {
  from: globals,
  to: out,
});

let s = result.css.replace(/:root\.dark/g, ':root:root');
s +=
  '\n/* design-sync: next/font vars (injected at runtime in the app) defined statically */\n' +
  ":root:root{--font-inter:'Inter',system-ui,sans-serif;--font-satoshi:'Satoshi',system-ui,sans-serif;}\n";

fs.writeFileSync(out, s);
console.log(`wrote ${path.relative(root, out)} (${s.length} bytes)`);
