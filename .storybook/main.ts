import type { StorybookConfig } from '@storybook/nextjs-vite';
import path from 'path';

const config: StorybookConfig = {
  stories: [
    '../components/**/*.stories.@(js|jsx|ts|tsx|mdx)',
    '../packages/**/*.stories.@(js|jsx|ts|tsx|mdx)',
    '../stories/**/*.@(mdx|stories.@(js|jsx|ts|tsx))',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
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
    config.resolve = {
      ...config.resolve,
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        ...config.resolve?.alias,
        // Mock Node.js modules that can't run in browser
        'node:async_hooks': require.resolve('./empty-module.js'),
        'server-only': require.resolve('./empty-module.js'),
        'next/cache': require.resolve('./empty-module.js'),
        'next/headers': require.resolve('./empty-module.js'),
        // Mock server actions that shouldn't run in Storybook
        '@/app/dashboard/actions': require.resolve(
          './dashboard-actions-mock.ts'
        ),
        '@/app/onboarding/actions': require.resolve('./empty-module.js'),
        // Also handle absolute imports without alias
        '../../../app/dashboard/actions': require.resolve(
          './dashboard-actions-mock.ts'
        ),
        '../../app/dashboard/actions': require.resolve(
          './dashboard-actions-mock.ts'
        ),
        '../app/dashboard/actions': require.resolve(
          './dashboard-actions-mock.ts'
        ),
        '../../../app/onboarding/actions': require.resolve('./empty-module.js'),
        '../../app/onboarding/actions': require.resolve('./empty-module.js'),
        '../app/onboarding/actions': require.resolve('./empty-module.js'),
        // Mock Next.js navigation for Storybook
        'next/navigation': require.resolve('./next-navigation-mock.js'),
        // Mock Clerk authentication for Storybook
        '@clerk/nextjs': path.resolve(__dirname, 'clerk-mock.jsx'),
        '@clerk/nextjs/server': path.resolve(__dirname, 'clerk-server-mock.js'),
        // Also handle any nested imports from server path
        '@clerk/nextjs/server/auth': path.resolve(
          __dirname,
          'clerk-server-mock.js'
        ),
        '@clerk/nextjs/server/currentUser': path.resolve(
          __dirname,
          'clerk-server-mock.js'
        ),
      },
    };

    // Configure Vite to handle TypeScript and JSX properly
    config.esbuild = {
      ...config.esbuild,
      target: 'es2020',
      loader: 'tsx',
      include: /\.(ts|tsx|js|jsx)$/,
    };

    return config;
  },
};

export default config;
