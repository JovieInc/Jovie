// Pre-build the artist-profile landing sections into ONE self-contained browser
// module the /design-sync converter can consume as its --entry (JOV-3502 / JOV-3514).
//
// Why: the converter's own tsconfigPathsPlugin (lib/bundle.mjs) mis-resolves this repo's
// wildcard `@/*` imports to directories ("is a directory"). Native esbuild resolves them
// correctly, so we bundle here (resolving @/* + applying the next/clerk/sentry stubs) into
// dist/landing.mjs with react/react-dom externalized. The converter then re-bundles a module
// that has no @/* imports left, sidestepping the bug. Run from the repo root AFTER the
// converter deps are staged (.ds-sync/ — see NOTES "one-command re-sync"):
//   node .design-sync-marketing/build-css.mjs            # css first
//   node .design-sync-marketing/prebuild.mjs             # this file -> dist/landing.mjs
//   node .ds-sync/package-build.mjs --config .design-sync-marketing/config.json \
//        --node-modules apps/web/node_modules --entry .design-sync-marketing/dist/landing.mjs --out ./ds-bundle
import { build } from '../.ds-sync/node_modules/esbuild/lib/main.js';

const STUBS = {
  'server-only': './apps/web/.storybook/empty-module.js',
  'next/headers': './apps/web/.storybook/empty-module.js',
  'next/cache': './apps/web/.storybook/empty-module.js',
  'next/navigation': './apps/web/.storybook/next-navigation-mock.js',
  'next/image': './.design-sync-marketing/stubs/next-image.tsx',
  'next/link': './.design-sync-marketing/stubs/next-link.tsx',
  'next/font/local': './.design-sync-marketing/stubs/next-font-local.js',
  '@clerk/nextjs': './apps/web/.storybook/clerk-mock.jsx',
  '@clerk/nextjs/server': './apps/web/.storybook/clerk-server-mock.js',
  '@sentry/react': './.design-sync-marketing/stubs/sentry-passthrough.tsx',
  '@sentry/browser': './.design-sync-marketing/stubs/sentry-passthrough.tsx',
  '@sentry/nextjs': './.design-sync-marketing/stubs/sentry-passthrough.tsx',
};

const result = await build({
  entryPoints: ['.design-sync-marketing/landing-entry.ts'],
  outfile: '.design-sync-marketing/dist/landing.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  logLevel: 'warning',
  nodePaths: ['apps/web/node_modules'],
  tsconfig: '.design-sync-marketing/tsconfig.designsync.json',
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
  : (await import('node:fs')).statSync(
      '.design-sync-marketing/dist/landing.mjs'
    ).size;
console.log(
  `prebuild: dist/landing.mjs ${(bytes / 1024).toFixed(0)} KB, ${result.errors.length} errors, ${result.warnings.length} warnings`
);
if (result.errors.length) process.exit(1);
