import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      './apps/web/vitest.config.mts',
      './apps/web/vitest.config.storybook.mts',
      './packages/ui/vitest.config.mts',
      './scripts/vitest.config.mts',
    ],
  },
});
