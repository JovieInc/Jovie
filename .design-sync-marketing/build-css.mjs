// design-sync CSS builder for the marketing surface.
//
// The marketing tree uses the same Tailwind v4 token system as @jovie/ui:
// all utilities and design tokens are compiled by apps/web's Tailwind pipeline.
// This script reproduces that compile into a static stylesheet for Claude Design
// so previews render with the real Jovie dark (carbon) styling.
//
// Approach (mirrors .design-sync/build-css.mjs):
// - Compiles apps/web/app/globals.css with the app's own @tailwindcss/postcss
//   (resolved from apps/web/node_modules via createRequire).
// - Scopes to the marketing component tree by replacing @import "tailwindcss"
//   with @import "tailwindcss" source(none). The globals.css already has
//   @source declarations; the marketing tree is added here at build time.
// - Rewrites :root.dark -> :root:root so the canonical dark carbon look is
//   the preview default (preview cards render as bare HTML, not <html class="dark">).
// - Defines --font-inter / --font-satoshi statically.
//
// Output: apps/web/.ds-design-sync-marketing.css (gitignored; regenerated on
// every sync). Referenced by cfg.cssEntry in config.json.
// Re-run via cfg.buildCmd: `node .design-sync-marketing/build-css.mjs`

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const postcss = requireWeb('postcss');
const tailwind = requireWeb('@tailwindcss/postcss');

const globals = path.join(root, 'apps/web/app/globals.css');
const out = path.join(root, 'apps/web/.ds-design-sync-marketing.css');

// Scope source detection to the marketing component tree: replace
// `@import "tailwindcss"` with `@import "tailwindcss" source(none)` so
// Tailwind only emits utilities for the classes in the marketing tree
// (not the full app). The @source declarations already in globals.css are
// preserved; the marketing tree is the target scan root.
let css = fs
  .readFileSync(globals, 'utf8')
  .replace(
    /@import\s+"tailwindcss"\s*;/,
    '@import "tailwindcss" source(none);'
  );

// Add the marketing tree as the explicit source scope so Tailwind v4
// includes all utilities referenced by marketing components.
css += '\n@source "../apps/web/components/marketing";\n';
css += '@source "../apps/web/components/features/home";\n';

const result = await postcss([tailwind()]).process(css, {
  from: globals,
  to: out,
});

// Flip dark to default: :root.dark → :root:root (same specificity trick as
// the @jovie/ui sync). Preview cards render with the carbon dark identity.
let s = result.css.replace(/:root\.dark/g, ':root:root');

// Define font CSS variables statically (next/font injects these at runtime
// in the app; @font-face rules are in fonts.css via cfg.extraFonts).
s +=
  '\n/* design-sync: next/font vars defined statically for preview rendering */\n' +
  ":root:root{--font-inter:'Inter',system-ui,sans-serif;--font-satoshi:'Satoshi',system-ui,sans-serif;}\n";

fs.writeFileSync(out, s);
console.log(`wrote ${path.relative(root, out)} (${s.length} bytes)`);
