import type { StorybookConfig } from '@storybook/nextjs-vite';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    '@chromatic-com/storybook',
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
    // Handle Node.js modules for browser compatibility
    config.define = {
      ...config.define,
      global: 'globalThis',
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
        { find: '@', replacement: path.resolve(__dirname, '..') },
        ...normalizedAlias,
      ],
    };

    // Configure Vite to handle TypeScript and JSX properly
    config.esbuild = {
      ...config.esbuild,
      target: 'es2020',
      loader: 'tsx',
      include: /\.(ts|tsx|js|jsx)$/,
    };

    // Exclude @clerk/elements from dependency optimization to prevent package.json lookup warning
    config.optimizeDeps = {
      ...config.optimizeDeps,
      exclude: [...(config.optimizeDeps?.exclude || []), '@clerk/elements'],
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
