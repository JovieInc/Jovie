import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: false,
  },
  resolve: {
    alias: {
      '@jovie/ui': path.resolve(__dirname, '.'),
      '@jovie/ui/lib/utils': path.resolve(__dirname, './lib/utils'),
    },
  },
});
