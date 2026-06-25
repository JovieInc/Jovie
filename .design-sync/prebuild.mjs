// Pre-build the homepage sections into ONE self-contained browser module the
// /design-sync converter can consume as its --entry.
//
// Why: the converter's own tsconfigPathsPlugin (lib/bundle.mjs) mis-resolves this
// repo's wildcard `@/*` imports to directories ("is a directory"). Native esbuild
// resolves them correctly, so we bundle here (resolving @/* + applying the
// next/clerk/sentry stubs) into dist/homepage.mjs with react/react-dom externalized.
// The converter then re-bundles a module that has no @/* imports left, sidestepping
// the bug. Run from the repo root AFTER the converter deps are staged (.ds-sync/):
//   node .design-sync/build-css.mjs            # css first
//   node .design-sync/prebuild.mjs             # this file -> dist/homepage.mjs
//   node .ds-sync/package-build.mjs --config .design-sync/config.json \
//        --node-modules apps/web/node_modules --entry .design-sync/dist/homepage.mjs --out ./ds-bundle

import { readFileSync } from 'node:fs';
import { build } from '../.ds-sync/node_modules/esbuild/lib/main.js';

// Data-URI map for public assets referenced by `<Image src="/...">` (generated
// by gen-images.mjs). Injected as a global the next/image stub resolves through.
let publicAssets = '{}';
try {
  publicAssets = readFileSync('.design-sync/dist/public-assets.json', 'utf8');
} catch {
  /* gen-images not run yet — stub falls back to the raw src */
}

const STUBS = {
  'server-only': './apps/web/.storybook/empty-module.js',
  'next/headers': './apps/web/.storybook/empty-module.js',
  'next/cache': './apps/web/.storybook/empty-module.js',
  'next/navigation': './apps/web/.storybook/next-navigation-mock.js',
  'next/image': './.design-sync/stubs/next-image.tsx',
  'next/link': './.design-sync/stubs/next-link.tsx',
  'next/font/local': './.design-sync/stubs/next-font-local.js',
  '@clerk/nextjs': './apps/web/.storybook/clerk-mock.jsx',
  '@clerk/nextjs/server': './apps/web/.storybook/clerk-server-mock.js',
  '@sentry/react': './.design-sync/stubs/sentry-passthrough.tsx',
  '@sentry/browser': './.design-sync/stubs/sentry-passthrough.tsx',
  '@sentry/nextjs': './.design-sync/stubs/sentry-passthrough.tsx',
};

const result = await build({
  entryPoints: ['.design-sync/homepage-entry.ts'],
  outfile: '.design-sync/dist/homepage.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  logLevel: 'warning',
  // Components read process.env.NEXT_PUBLIC_* via lazy getters (apps/web/lib/
  // env-public.ts) — all with `|| fallback`, so an empty env is safe. The
  // browser sandbox has no `process`, so shim it; without this the bundle
  // throws `process is not defined` on load and window.<global> never assigns.
  // (NODE_ENV itself is replaced inline by the converter's own esbuild define.)
  banner: {
    js:
      'globalThis.process = globalThis.process || { env: {} };' +
      `globalThis.__DS_PUBLIC_ASSETS = ${publicAssets};`,
  },
  nodePaths: ['apps/web/node_modules'],
  tsconfig: '.design-sync/tsconfig.designsync.json',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom/client',
  ],
  loader: {
    '.svg': 'dataurl',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.webp': 'dataurl',
    '.woff': 'dataurl',
    '.woff2': 'dataurl',
  },
  alias: STUBS,
});

const bytes = result.errors.length
  ? 0
  : (await import('node:fs')).statSync('.design-sync/dist/homepage.mjs').size;
console.log(
  `prebuild: dist/homepage.mjs ${(bytes / 1024).toFixed(0)} KB, ${result.errors.length} errors, ${result.warnings.length} warnings`
);
if (result.errors.length) process.exit(1);
