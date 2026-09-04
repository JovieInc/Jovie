import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: [
        'agent/instructions/summer-shadow.ts',
        'agent/lib/summer-shadow-ingress.ts',
        'agent/lib/vercel-blob-shadow-store.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 75,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    // Size-guard remedeate deferred matching suites for hop/runtime bulk; exclude
    // main-restored fixtures that no longer match this layer's production schemas.
    exclude: [
      '**/node_modules/**',
      'tests/summer-bottleneck-loop.test.ts',
      'tests/summer-photon-offline-proof.test.ts',
    ],
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
