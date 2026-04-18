import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      './apps/web/vitest.config.mts',
      './packages/ui/vitest.config.mts',
    ],
  },
});
