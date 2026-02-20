import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    storybookTest({
      configDir: path.join(dirname, '.storybook'),
      tags: {
        exclude: ['no-vitest'],
      },
    }),
  ],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./.storybook/vitest.setup.ts'],
    // Retry once in CI to handle transient Vite browser-mode module serving failures
    // (Storybook's internal React 18 compat chunk occasionally fails to load)
    retry: process.env.CI ? 1 : 0,
  },
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
  optimizeDeps: {
    include: [
      // React core
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      // Storybook / Next.js framework
      '@storybook/nextjs-vite',
      'next-themes',
      'sonner',
      // UI libraries
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'lucide-react',
      'motion/react',
      'vaul',
      'react-error-boundary',
      // Radix UI primitives
      '@radix-ui/react-slot',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      // Data / state
      '@tanstack/react-query',
      '@tanstack/react-pacer',
      // Next.js internals
      'next/link',
      'next/dynamic',
      'next/dist/client/components/redirect-error',
      // Server-side deps (referenced by stories indirectly)
      '@sentry/nextjs',
      'isomorphic-dompurify',
      'drizzle-orm',
      'drizzle-orm/pg-core',
      'drizzle-orm/neon-http',
      'drizzle-zod',
      'zod',
      '@upstash/ratelimit',
      '@upstash/redis',
      '@neondatabase/serverless',
      'jose',
      'stripe',
    ],
  },
});
