import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Next's compiled React (next/dist/compiled/react*) is CJS without a default
 * export. Rewrite those ids by re-resolving the real package name so Vite keeps
 * the id on the package graph and can apply optimizeDeps + needsInterop.
 *
 * Critical: do NOT return a bare string 'react' (already-resolved, breaks load)
 * and do NOT return require.resolve('react') absolute paths (served as raw
 * /@fs CJS without default-export interop). Always use this.resolve().
 */
function rewriteNextCompiledReactPlugin(): Plugin {
  return {
    name: 'jovie-vitest-storybook-rewrite-next-react',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const normalized = source.replace(/\\/g, '/');
      if (!normalized.includes('next/dist/compiled/react')) {
        return null;
      }

      let bare: string | null = null;
      if (normalized.includes('next/dist/compiled/react-dom')) {
        bare = 'react-dom';
      } else if (normalized.includes('next/dist/compiled/react/jsx-dev-runtime')) {
        bare = 'react/jsx-dev-runtime';
      } else if (normalized.includes('next/dist/compiled/react/jsx-runtime')) {
        bare = 'react/jsx-runtime';
      } else if (
        normalized.includes('next/dist/compiled/react/index.js') ||
        normalized.endsWith('next/dist/compiled/react') ||
        normalized.includes('next/dist/compiled/react.js')
      ) {
        bare = 'react';
      }

      if (!bare) return null;

      return this.resolve(bare, importer, {
        ...options,
        skipSelf: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    rewriteNextCompiledReactPlugin(),
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
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'react-dom/client',
          ],
        },
      },
    },
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
    holdUntilCrawlEnd: false,
    // React 19 entrypoints are CJS. needsInterop forces the default-export
    // shim that browser-mode ESM imports require.
    needsInterop: ['react', 'react-dom', 'react-dom/client'],
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
