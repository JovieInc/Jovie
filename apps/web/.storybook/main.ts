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
        // Mock Next.js navigation for Storybook
        {
          find: 'next/navigation',
          replacement: require.resolve('./next-navigation-mock.js'),
        },
        // Mock Clerk authentication for Storybook
        {
          find: '@clerk/nextjs',
          replacement: path.resolve(__dirname, 'clerk-mock.jsx'),
        },
        {
          find: '@clerk/nextjs/server',
          replacement: path.resolve(__dirname, 'clerk-server-mock.js'),
        },
        // Also handle any nested imports from server path
        {
          find: '@clerk/nextjs/server/auth',
          replacement: path.resolve(__dirname, 'clerk-server-mock.js'),
        },
        {
          find: '@clerk/nextjs/server/currentUser',
          replacement: path.resolve(__dirname, 'clerk-server-mock.js'),
        },
        // Mock @clerk/elements to prevent package.json lookup warning
        {
          find: '@clerk/elements',
          replacement: path.resolve(__dirname, 'clerk-elements-mock.jsx'),
        },
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
        // Project aliases
        { find: '@', replacement: path.resolve(__dirname, '..') },
        {
          find: '@jovie/ui',
          replacement: path.resolve(__dirname, '../packages/ui'),
        },
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
