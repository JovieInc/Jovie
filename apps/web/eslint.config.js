const nextConfig = require('eslint-config-next');
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');
const iconUsageRule = require('./eslint-rules/icon-usage');
const edgeRuntimeNodeImportsRule = require('./eslint-rules/edge-runtime-node-imports');
const noHandlerInitializationRule = require('./eslint-rules/no-handler-initialization');
const serverOnlyImportsRule = require('./eslint-rules/server-only-imports');
const useClientDirectiveRule = require('./eslint-rules/use-client-directive');
const readonlyComponentPropsRule = require('./eslint-rules/readonly-component-props');
const noDbTransactionRule = require('./eslint-rules/no-db-transaction');
const noManualDbPoolingRule = require('./eslint-rules/no-manual-db-pooling');
const noHardcodedRoutesRule = require('./eslint-rules/no-hardcoded-routes');
const requireQueryCacheConfigRule = require('./eslint-rules/require-query-cache-config');
const requireAbortSignalRule = require('./eslint-rules/require-abort-signal');

const [nextBase, nextTypescript, nextIgnores] = nextConfig;

const baseConfig = {
  ...nextBase,
  plugins: {
    ...nextBase.plugins,
    '@jovie': {
      rules: {
        'icon-usage': iconUsageRule,
        'edge-runtime-node-imports': edgeRuntimeNodeImportsRule,
        'no-handler-initialization': noHandlerInitializationRule,
        'server-only-imports': serverOnlyImportsRule,
        'use-client-directive': useClientDirectiveRule,
        'readonly-component-props': readonlyComponentPropsRule,
        'no-db-transaction': noDbTransactionRule,
        'no-manual-db-pooling': noManualDbPoolingRule,
        'no-hardcoded-routes': noHardcodedRoutesRule,
        'require-query-cache-config': requireQueryCacheConfigRule,
        'require-abort-signal': requireAbortSignalRule,
      },
    },
  },
  settings: {
    ...(nextBase.settings || {}),
    next: {
      rootDir: ['apps/web'],
    },
    'import/resolver': {
      typescript: {},
    },
  },
  rules: {
    ...nextBase.rules,
    // NOTE: prefer-const moved to Biome as style/useConst for efficiency
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@clerk/clerk-react',
            message:
              'Use @clerk/nextjs in the App Router. Import components/hooks from @clerk/nextjs or @clerk/nextjs/server only.',
          },
          {
            name: '@/components/atoms/Select',
            message: "Use Select from '@jovie/ui' instead of local atoms.",
          },
          {
            name: '@/components/atoms/Button',
            message: "Use Button from '@jovie/ui' instead of local atoms.",
          },
          {
            name: '@/components/atoms/Sheet',
            message:
              "Use Sheet components from '@jovie/ui' instead of local atoms.",
          },
          {
            name: '@/components/atoms/Tooltip',
            message:
              "Use Tooltip components from '@jovie/ui' instead of local atoms.",
          },
          {
            name: '@/components/atoms/Popover',
            message:
              "Use Popover components from '@jovie/ui' instead of local atoms.",
          },
          {
            name: '@/components/atoms/DropdownMenu',
            message:
              "Use DropdownMenu components from '@jovie/ui' instead of local atoms.",
          },
          // Block barrel imports (index.ts) for better build performance
          {
            name: '@/components/atoms',
            message:
              'Avoid barrel imports for better build performance. Import directly from the specific file: e.g., @/components/atoms/Button',
          },
          {
            name: '@/components/molecules',
            message:
              'Avoid barrel imports for better build performance. Import directly from the specific file.',
          },
          {
            name: '@/components/organisms',
            message:
              'Avoid barrel imports for better build performance. Import directly from the specific file.',
          },
          {
            name: '@/components/dashboard',
            message:
              'Avoid barrel imports for better build performance. Import directly from the specific file.',
          },
          {
            name: '@/components/dashboard/molecules',
            message:
              'Avoid barrel imports for better build performance. Import directly from the specific file.',
          },
          {
            name: '@/components/dashboard/organisms',
            message:
              'Avoid barrel imports for better build performance. Import directly from the specific file.',
          },
          {
            name: '@/lib/db/schema',
            message:
              'Avoid barrel imports for better build performance. Import from specific schema files: e.g., @/lib/db/schema/auth, @/lib/db/schema/profiles',
          },
        ],
        patterns: [
          {
            group: [
              '../components/atoms/Button',
              './components/atoms/Button',
              'components/atoms/Button',
            ],
            message: "Use Button from '@jovie/ui' instead of local atoms.",
          },
        ],
      },
    ],

    // NOTE: Using import/no-duplicates only (has auto-fix), removed redundant no-duplicate-imports
    'import/no-duplicates': 'error',
    'import/no-cycle': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "ImportSpecifier[imported.name='sql'][local.name='sql'][parent.source.value='drizzle-orm']",
        message:
          "Alias drizzle's sql as drizzleSql to avoid conflicts with Neon client.",
      },
    ],
    '@jovie/icon-usage': 'error',
    '@jovie/edge-runtime-node-imports': 'error',
    '@jovie/no-handler-initialization': 'error',
    '@jovie/server-only-imports': 'error',
    '@jovie/use-client-directive': 'error',
    // Enforce readonly modifiers on React component props for type safety
    '@jovie/readonly-component-props': 'error',
    // Database guardrails - Neon HTTP driver restrictions
    '@jovie/no-db-transaction': 'error',
    '@jovie/no-manual-db-pooling': 'error',
    // Route management - prevent hardcoded paths
    '@jovie/no-hardcoded-routes': 'error',
    '@jovie/require-query-cache-config': 'error',
    '@jovie/require-abort-signal': 'error',
  },
};

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
      '**/*.tsbuildinfo',
      '**/*.config.js',
      '**/*.config.ts',
      '**/.cache/**',
      '**/.temp/**',
      '**/.tmp/**',
      '**/*.log',
      '**/.env*',
      '!**/.env.example',
      '**/.vscode/**',
      '**/.idea/**',
      '**/dist/**',
      '**/public/**',
      'eslint.config.js',
      'next.config.js',
      '**/.storybook/**',
      'scripts/fix-spotify-ids.js',
      'tests/e2e/**',
      '.github/scripts/**',
    ],
  },
  baseConfig,
  nextTypescript,
  nextIgnores,
  // NOTE: @typescript-eslint/no-unused-vars and @typescript-eslint/no-explicit-any
  // are intentionally NOT included here - Biome handles these via:
  // - correctness/noUnusedImports + correctness/noUnusedVariables
  // - suspicious/noExplicitAny
  ...nextCoreWebVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/purity': 'off',
      // Informational only - React Compiler already skips memoizing incompatible libraries
      'react-hooks/incompatible-library': 'off',
    },
  },
  {
    files: ['**/components/dashboard/**/*'],
    rules: {
      'import/no-cycle': 'off',
    },
  },
  {
    files: ['**/components/atoms/**/*.ts', '**/components/atoms/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              importNames: [
                'useState',
                'useEffect',
                'useMemo',
                'useCallback',
                'useRef',
              ],
              message:
                'Atoms must be props-only. Move hook logic to molecules or organisms.',
            },
          ],
        },
      ],
    },
  },
  // NOTE: Test file overrides for @typescript-eslint/no-explicit-any removed
  // - Biome already disables suspicious/noExplicitAny for test files
  // Disable server/client boundary rules for server-only contexts
  {
    files: ['**/app/api/**', '**/actions.ts', '**/actions/*.ts'],
    rules: {
      '@jovie/use-client-directive': 'off',
      '@jovie/server-only-imports': 'off',
    },
  },
  // TODO: Admin components have legacy server import patterns that need refactoring
  // These should be migrated to use server actions instead of direct imports
  {
    files: ['**/components/admin/**'],
    rules: {
      '@jovie/server-only-imports': 'off',
    },
  },
  // Stories and test files don't run in Next.js App Router
  {
    files: [
      '**/*.stories.tsx',
      '**/*.stories.ts',
      '**/tests/**',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    rules: {
      '@jovie/use-client-directive': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
  // lib/db internal files are allowed to use database patterns
  {
    files: ['**/lib/db/**'],
    rules: {
      '@jovie/no-db-transaction': 'off',
      '@jovie/no-manual-db-pooling': 'off',
    },
  },
];
