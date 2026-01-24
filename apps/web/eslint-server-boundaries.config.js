/**
 * ESLint configuration for server/client boundary checks only.
 *
 * This minimal config is used in CI to catch new server/client boundary violations
 * without being blocked by pre-existing lint issues.
 */

const tsParser = require('@typescript-eslint/parser');
const serverOnlyImportsRule = require('./eslint-rules/server-only-imports');
const useClientDirectiveRule = require('./eslint-rules/use-client-directive');

module.exports = [
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/out/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vercel/**',
      'storybook-static/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.d.ts',
      '**/*.config.js',
      '**/*.config.ts',
      '**/.cache/**',
      '**/dist/**',
      '**/public/**',
      'eslint.config.js',
      'eslint-server-boundaries.config.js',
      'next.config.js',
      '**/.storybook/**',
      'tests/e2e/**',
      // Exclude test files and server contexts
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.stories.tsx',
      '**/tests/**',
      '**/app/api/**',
      '**/actions.ts',
      '**/actions/*.ts',
      // Exclude admin components (legacy patterns, being addressed separately)
      '**/components/admin/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@jovie': {
        rules: {
          'server-only-imports': serverOnlyImportsRule,
          'use-client-directive': useClientDirectiveRule,
        },
      },
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Server-only imports are critical errors - these would cause runtime failures
      '@jovie/server-only-imports': 'error',
      // Missing 'use client' is a warning initially for gradual adoption
      // TODO: Promote to 'error' once existing violations are fixed
      '@jovie/use-client-directive': 'warn',
    },
  },
];
