import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../web', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx,mjs}'],
    exclude: ['node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      include: [
        'proxy.ts',
        'lib/access.ts',
        'scripts/routes.mjs',
        'next.config.mjs',
        'app/signin/page.tsx',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
        'proxy.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        'lib/access.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
