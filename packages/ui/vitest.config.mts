import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/**', 'dist/**', '**/*.d.ts'],
    },
    globals: false,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@jovie/ui': path.resolve(__dirname, '.'),
      '@jovie/ui/lib/utils': path.resolve(__dirname, './lib/utils'),
    },
  },
});
