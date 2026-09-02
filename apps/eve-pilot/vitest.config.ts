import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: [
        'agent/instructions/summer-shadow.ts',
        'agent/lib/summer-photon-offline-proof.ts',
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
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
