import type { StorybookConfig } from '@storybook/nextjs-vite';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: [
    '../components/**/*.stories.@(js|jsx|ts|tsx|mdx)',
    // packages/ui atoms — highest-reuse surface; must enter Chromatic/Storybook
    // (Phase 2 visual-testing coverage; see docs/VISUAL_TESTING_POLICY.md).
    '../../../packages/ui/**/*.stories.@(js|jsx|ts|tsx|mdx)',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    '@chromatic-com/storybook',
    '@storybook/addon-mcp',
  ],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {
      builder: {
        viteConfigPath: undefined,
      },
    },
  },
  docs: {},
  typescript: {
    check: true,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: prop =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
      compilerOptions: {
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      },
    },
  },
  core: {
    disableTelemetry: true,
  },
  viteFinal: async config => {
    // Handle Node.js modules for browser compatibility.
    // Chromatic extracts stories in a real browser. Client components that
    // reference process.env.* crash extraction with
    // "ReferenceError: process is not defined" (seen on Sidebar.stories).
    // Define individual keys only — never replace the whole `process` object
    // with a JSON string (that breaks process.env.FOO member access).
    config.define = {
      ...config.define,
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV || 'development'
      ),
      'process.env.NEXT_PUBLIC_APP_VERSION': JSON.stringify(
        process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0-storybook'
      ),
      'process.env.NEXT_PUBLIC_BUILD_SHA': JSON.stringify(
        process.env.NEXT_PUBLIC_BUILD_SHA || 'storybook'
      ),
      'process.env.NEXT_PUBLIC_CI': JSON.stringify(
        process.env.NEXT_PUBLIC_CI || ''
      ),
      'process.env.NEXT_PUBLIC_DEMO_RECORDING': JSON.stringify(
        process.env.NEXT_PUBLIC_DEMO_RECORDING || ''
      ),
    };

    // Ensure TypeScript files are properly handled
    const existingAlias = config.resolve?.alias;
    const normalizedAlias = Array.isArray(existingAlias)
      ? existingAlias
      : existingAlias && typeof existingAlias === 'object'
        ? Object.entries(existingAlias).map(([find, replacement]) => ({
            find,
            replacement,
          }))
        : [];

    config.resolve = {
      ...config.resolve,
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: [
        // Must come before the generic '@' alias to avoid resolving to the real file.
        {
          find: '@/app/app/(shell)/dashboard/DashboardLayoutClient',
          replacement: require.resolve('./dashboard-layout-client-mock.tsx'),
        },
        {
          find: '@/components/organisms/AuthShellWrapper',
          replacement: require.resolve('./dashboard-layout-client-mock.tsx'),
        },
        {
          find: '@/app/app/(shell)/dashboard/actions/dashboard-data',
          replacement: require.resolve('./dashboard-actions-mock.ts'),
        },
        {
          find: '@/app/app/(shell)/dashboard/actions/creator-profile',
          replacement: require.resolve('./dashboard-actions-mock.ts'),
        },
        {
          find: '@/app/onboarding/actions/connect-spotify',
          replacement: require.resolve('./onboarding-actions-mock.ts'),
        },
        {
          find: '@/app/onboarding/actions/update-profile',
          replacement: require.resolve('./onboarding-actions-mock.ts'),
        },
        {
          find: '@/app/onboarding/actions/enrich-profile',
          replacement: require.resolve('./enrich-profile-mock.ts'),
        },
        {
          // task-actions.ts dynamically imports lib/ai/anthropic
          // (@anthropic-ai/sdk, Node-only) — keep it out of the browser
          // preview bundle.
          find: '@/app/app/(shell)/dashboard/releases/task-actions',
          replacement: require.resolve('./release-task-actions-mock.ts'),
        },
        {
          find: '@/app/app/(shell)/dashboard/releases/catalog-task-actions',
          replacement: require.resolve('./release-task-actions-mock.ts'),
        },
        {
          // lib/auth/better-auth.ts imports this RELATIVELY
          // ('./apple-client-secret'), so a plain '@/…' find never matches.
          // Full-specifier regex: .replace() swaps the entire id for the
          // mock's absolute path, for both aliased and relative forms.
          find: /^(.*\/)?apple-client-secret$/,
          replacement: require.resolve('./apple-client-secret-mock.ts'),
        },
        {
          // lib/auth/test-mode.ts imports node:net at module scope; matched
          // by full-specifier regex for both '@/…' and relative imports
          // ('test-mode-constants' does not match the $-anchored pattern).
          find: /^(.*\/)?test-mode$/,
          replacement: require.resolve('./test-mode-mock.ts'),
        },
        {
          find: '@/lib/auth/better-auth',
          replacement: require.resolve('./better-auth-mock.ts'),
        },
        {
          find: '@/lib/auth/require-auth',
          replacement: require.resolve('./require-auth-mock.ts'),
        },
        {
          find: '@/lib/auth/dev-test-auth.server',
          replacement: require.resolve('./dev-test-auth-server-mock.ts'),
        },
        {
          find: '@/lib/auth/dev-test-auth-identity',
          replacement: require.resolve('./dev-test-auth-identity-mock.ts'),
        },
        {
          find: '@/app/app/(shell)/dashboard/actions',
          replacement: require.resolve('./dashboard-actions-mock.ts'),
        },
        {
          find: '@/app/onboarding/actions',
          replacement: require.resolve('./onboarding-actions-mock.ts'),
        },
        // Also handle absolute imports without alias
        {
          find: '../../../app/app/(shell)/dashboard/actions',
          replacement: require.resolve('./dashboard-actions-mock.ts'),
        },
        {
          find: '../../app/app/(shell)/dashboard/actions',
          replacement: require.resolve('./dashboard-actions-mock.ts'),
        },
        {
          find: '../app/app/(shell)/dashboard/actions',
          replacement: require.resolve('./dashboard-actions-mock.ts'),
        },
        {
          find: '../../../app/onboarding/actions',
          replacement: require.resolve('./onboarding-actions-mock.ts'),
        },
        {
          find: '../../app/onboarding/actions',
          replacement: require.resolve('./onboarding-actions-mock.ts'),
        },
        {
          find: '../app/onboarding/actions',
          replacement: require.resolve('./onboarding-actions-mock.ts'),
        },
        // Mock Node.js modules that can't run in browser
        {
          find: 'node:async_hooks',
          replacement: require.resolve('./empty-module.js'),
        },
        {
          find: 'server-only',
          replacement: require.resolve('./empty-module.js'),
        },
        {
          find: 'next/cache',
          replacement: require.resolve('./empty-module.js'),
        },
        {
          find: 'next/headers',
          replacement: require.resolve('./empty-module.js'),
        },
        {
          // lib/auth server modules import NextRequest/NextResponse; the
          // real next/server entry drags in compiled ua-parser-js, which
          // needs __dirname and crashes the browser story build.
          find: 'next/server',
          replacement: require.resolve('./next-server-mock.js'),
        },
        {
          // next/constants (pulled in by @sentry/nextjs' isBuild util)
          // evaluates `process?.features?.typescript` at module top level,
          // which crashes plain-browser story extraction (Chromatic).
          find: 'next/constants',
          replacement: require.resolve('./next-constants-mock.js'),
        },
        // Mock Next.js navigation for Storybook
        {
          find: 'next/navigation',
          replacement: require.resolve('./next-navigation-mock.js'),
        },
        // Mock Clerk authentication for Storybook
        // IMPORTANT: More specific paths MUST come before less specific ones
        {
          find: '@clerk/nextjs/server/auth',
          replacement: path.resolve(__dirname, 'clerk-server-mock.js'),
        },
        {
          find: '@clerk/nextjs/server/currentUser',
          replacement: path.resolve(__dirname, 'clerk-server-mock.js'),
        },
        {
          find: '@clerk/nextjs/server',
          replacement: path.resolve(__dirname, 'clerk-server-mock.js'),
        },
        {
          find: '@clerk/nextjs/errors',
          replacement: path.resolve(__dirname, 'clerk-server-mock.js'),
        },
        {
          find: '@clerk/nextjs',
          replacement: path.resolve(__dirname, 'clerk-mock.jsx'),
        },
        // Mock @clerk/elements to prevent package.json lookup warning
        // IMPORTANT: More specific paths MUST come before less specific ones
        {
          find: '@clerk/elements/common',
          replacement: path.resolve(__dirname, 'clerk-elements-mock.jsx'),
        },
        {
          find: '@clerk/elements/sign-in',
          replacement: path.resolve(__dirname, 'clerk-elements-mock.jsx'),
        },
        {
          find: '@clerk/elements/sign-up',
          replacement: path.resolve(__dirname, 'clerk-elements-mock.jsx'),
        },
        {
          find: '@clerk/elements',
          replacement: path.resolve(__dirname, 'clerk-elements-mock.jsx'),
        },
        // Project aliases
        {
          find: '@/features',
          replacement: path.resolve(__dirname, '../components/features'),
        },
        {
          find: '@jovie/ui',
          replacement: path.resolve(__dirname, '../../../packages/ui'),
        },
        // Keep React as bare package IDs (not absolute CJS paths). Absolute
        // require.resolve('react') forces Vite to serve raw /@fs CJS without
        // default-export interop, which breaks browser-mode story tests
        // ("does not provide an export named 'default'"). Bare IDs let
        // optimizeDeps prebundle + interop correctly. next/dist/compiled/react
        // is rewritten to bare 'react' below.
        { find: '@', replacement: path.resolve(__dirname, '..') },
        ...normalizedAlias,
      ],
      dedupe: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    };

    // Storybook 10 + modern packages need a current esbuild target.
    // `es2020` makes esbuild hard-fail on object rest/destructuring in
    // Storybook/Next packages ("Transforming destructuring ... is not supported"),
    // which either spams the log or fails the preview build entirely.
    config.esbuild = {
      ...config.esbuild,
      target: 'esnext',
    };

    // Keep optimizeDeps on, but never hold browser requests until crawl end.
    // In this monorepo the crawl is huge; holding deps leaves the iframe spinner
    // forever while /sb-vite/deps/* never materializes.
    config.optimizeDeps = {
      ...config.optimizeDeps,
      exclude: [...(config.optimizeDeps?.exclude || []), '@clerk/elements'],
      holdUntilCrawlEnd: false,
      // React 19 CJS entries need default-export interop in the browser ESM graph.
      needsInterop: [
        ...new Set([
          ...(config.optimizeDeps?.needsInterop || []),
          'react',
          'react-dom',
          'react-dom/client',
        ]),
      ],
      include: [
        ...new Set([
          ...(config.optimizeDeps?.include || []),
          'react',
          'react-dom',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          'react-dom/client',
        ]),
      ],
      esbuildOptions: {
        ...(config.optimizeDeps?.esbuildOptions || {}),
        target: 'esnext',
      },
    };

    // Absolute-path imports of next/dist/compiled/react bypass package resolution.
    // Re-resolve through Vite so optimizeDeps + needsInterop still apply.
    // Do NOT return bare 'react' (already-resolved) or absolute CJS paths
    // (raw /@fs without default-export interop).
    const rewriteNextReactPlugin = {
      name: 'jovie-storybook-rewrite-next-react',
      enforce: 'pre' as const,
      async resolveId(
        this: {
          resolve: (
            source: string,
            importer: string | undefined,
            options: { skipSelf?: boolean }
          ) => Promise<{ id: string } | null>;
        },
        source: string,
        importer: string | undefined
      ) {
        const normalized = source.replace(/\\/g, '/');
        if (!normalized.includes('next/dist/compiled/react')) {
          return null;
        }

        let bare: string | null = null;
        if (normalized.includes('next/dist/compiled/react-dom')) {
          bare = 'react-dom';
        } else if (
          normalized.includes('next/dist/compiled/react/jsx-dev-runtime')
        ) {
          bare = 'react/jsx-dev-runtime';
        } else if (
          normalized.includes('next/dist/compiled/react/jsx-runtime')
        ) {
          bare = 'react/jsx-runtime';
        } else if (
          normalized.includes('next/dist/compiled/react/index.js') ||
          normalized.endsWith('next/dist/compiled/react') ||
          normalized.includes('next/dist/compiled/react.js')
        ) {
          bare = 'react';
        }

        if (!bare) return null;

        return this.resolve(bare, importer, { skipSelf: true });
      },
    };

    // Vercel Workflow / WDK Vite plugins (from next.config withWorkflow) emit
    // continuous page reloads of app/.well-known/workflow/* and can starve
    // Storybook's optimized-deps generation. Strip them for local Storybook.
    const stripWorkflowPlugins = (plugins: unknown): unknown[] => {
      const list = Array.isArray(plugins) ? plugins : plugins ? [plugins] : [];
      return list.filter(plugin => {
        const name =
          plugin &&
          typeof plugin === 'object' &&
          'name' in plugin &&
          typeof (plugin as { name?: unknown }).name === 'string'
            ? String((plugin as { name: string }).name).toLowerCase()
            : '';
        if (!name) return true;
        return !(
          name.includes('workflow') ||
          name.includes('wdk') ||
          name.includes('vercel-toolbar')
        );
      });
    };
    config.plugins = [
      rewriteNextReactPlugin,
      ...stripWorkflowPlugins(config.plugins),
    ] as typeof config.plugins;

    // Ignore workflow generated routes so HMR does not thrash the preview iframe.
    config.server = {
      ...config.server,
      watch: {
        ...(config.server &&
        typeof config.server === 'object' &&
        'watch' in config.server &&
        config.server.watch &&
        typeof config.server.watch === 'object'
          ? config.server.watch
          : {}),
        ignored: [
          '**/app/.well-known/workflow/**',
          '**/.well-known/workflow/**',
          '**/node_modules/**',
        ],
      },
    };

    // Suppress "use client" directive warnings in build output
    config.build = {
      ...config.build,
      // Vite's default target includes safari14, for which esbuild cannot
      // lower the object-rest destructuring used in @jovie/ui components —
      // the final chunk transpile fails with "Transforming destructuring …
      // is not supported yet". es2020 keeps that syntax as-is.
      target: 'es2020',
      rollupOptions: {
        ...config.build?.rollupOptions,
        onwarn(warning, warn) {
          // Suppress "use client" directive warnings
          if (
            warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
            warning.message.includes('use client')
          ) {
            return;
          }
          warn(warning);
        },
      },
    };

    return config;
  },
};

export default config;
