import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['outcome.ts'],
      reporter: ['text'],
      reportsDirectory: '.cache/coverage',
      thresholds: { lines: 100, branches: 95, functions: 100, statements: 100 },
    },
  },
});
