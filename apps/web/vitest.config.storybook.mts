import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./.storybook/vitest.setup.ts'],
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
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      '@sentry/nextjs',
      'isomorphic-dompurify',
      'motion/react',
      'vaul',
      '@tanstack/react-query',
      'react-error-boundary',
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
