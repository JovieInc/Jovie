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
    retry: process.env.CI ? 3 : 0,
    fileParallelism: false,
  },
  esbuild: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      // next-themes injects a server bootstrap <script>. Browser-mode story
      // tests mount previews entirely on the client, where React warns for
      // every script and never executes it.
      'next-themes': path.join(dirname, '.storybook/next-themes-mock.tsx'),
    },
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
  optimizeDeps: {
    // Default Vite browser target (chrome87) cannot esbuild-prebundle modern ESM
    // (destructuring, etc.) pulled in transitively by Storybook stories.
    esbuildOptions: {
      target: 'esnext',
    },
    include: [
      // React core
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      // Storybook / Next.js framework
      '@storybook/nextjs-vite',
      'sonner',
      // UI libraries
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'lucide-react',
      'motion/react',
      'vaul',
      'react-error-boundary',
      '@jovie/ui > react-hook-form',
      'dompurify',
      // Radix UI primitives
      '@radix-ui/react-slot',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-checkbox',
      '@jovie/ui > @radix-ui/react-context-menu',
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
      '@tanstack/react-table',
      '@tanstack/react-virtual',
      // Next.js internals
      'next/link',
      'next/dynamic',
      'next/image',
      'next/navigation',
      'next/script',
      'next/dist/client/components/redirect-error',
      // Drag-and-drop
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      // UI extras
      '@floating-ui/react',
      '@headlessui/react',
      'cmdk',
      'nuqs',
      'nuqs/adapters/next/app',
      'recharts',
      // Analytics
      '@vercel/analytics/react',
      // AI SDK (used by chat components)
      '@ai-sdk/react',
    ],
  },
});
