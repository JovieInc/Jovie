const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const iconUsageRule = require('./eslint-rules/icon-usage');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/out/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vercel/**',
      // Generated static outputs/reports
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
      // Config files that use require() by necessity
      'eslint.config.js',
      'next.config.js',
      '**/.storybook/**',
      // Archive and script files
      'scripts/archive-supabase/**',
      'scripts/db-migrate.js',
      'scripts/ensure-valid-artist-images.js',
      'scripts/update-artist-images.js',
      'scripts/verify-artist-images.js',
      'scripts/fix-spotify-ids.js',
      // E2E tests with @ts-ignore for Playwright
      'tests/e2e/**',
      // GitHub action scripts
      '.github/scripts/**',
    ],
  },
  ...compat.extends(
    'next',
    'next/core-web-vitals',
    'next/typescript',
    'plugin:import/recommended'
  ),
  {
    plugins: {
      '@jovie': {
        rules: {
          'icon-usage': iconUsageRule,
        },
      },
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase',
              message:
                "Client-side Supabase is deprecated. Use server-only helpers from '@/lib/supabase/client' or server routes/actions.",
            },
            {
              name: '@clerk/clerk-react',
              message:
                'Use @clerk/nextjs in the App Router. Import components/hooks from @clerk/nextjs or @clerk/nextjs/server only.',
            },
            // Enforce using shared UI package
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

      // Prevent duplicate imports
      'no-duplicate-imports': 'error',
      'import/no-duplicates': 'error',

      // Prevent cycles (disabled for dashboard components due to architectural complexity)
      'import/no-cycle': 'error',

      // Prevent sql alias collision
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportSpecifier[imported.name='sql'][local.name='sql'][parent.source.value='drizzle-orm']",
          message:
            "Alias drizzle's sql as drizzleSql to avoid conflicts with Neon client.",
        },
      ],

      // Icon usage standards enforcement
      '@jovie/icon-usage': 'error',
    },
  }, // Disable specific rules for dashboard components due to architectural complexity
  {
    files: ['**/components/dashboard/**/*'],
    rules: {
      'import/no-cycle': 'off',
    },
  }, // Allow any types in test files for complex mocks
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
