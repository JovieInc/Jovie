import { defineConfig } from 'vitest/config';
import RetryVisibilityReporter from '../../../vitest-retry-reporter.mjs';

// Child-process config for vitest-retry-reporter.test.mjs.
export default defineConfig({
  // Keep Vite/Vitest caches out of the source tree.
  cacheDir: process.env.RETRY_FIXTURE_CACHE_DIR,
  test: {
    include: [process.env.RETRY_FIXTURE_INCLUDE ?? '*.fixture.mjs'],
    retry: 1,
    reporters: [
      new RetryVisibilityReporter({
        outputFile: process.env.RETRY_FIXTURE_OUTPUT,
        label: 'fixture',
      }),
    ],
  },
});
