const nextConfig = require('eslint-config-next');
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');
const boundariesPlugin = require('eslint-plugin-boundaries');
const tsParser = require('@typescript-eslint/parser');
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
const noRawMotionValuesRule = require('./eslint-rules/no-raw-motion-values');
const noDirectElectronBridgeRule = require('./eslint-rules/no-direct-electron-bridge');
const noBannedMarketingCopyRule = require('./eslint-rules/no-banned-marketing-copy');
const noRawFocusRingRule = require('./eslint-rules/no-raw-focus-ring');
const noAdHocCurrencyRule = require('./eslint-rules/no-ad-hoc-currency');
const chatToolSchemaStrictRule = require('./eslint-rules/chat-tool-schema-strict');
const canonicalUiLabelCasingRule = require('./eslint-rules/canonical-ui-label-casing');
const noHardcodedThemeColorsRule = require('./eslint-rules/no-hardcoded-theme-colors');

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
        'no-raw-motion-values': noRawMotionValuesRule,
        'no-direct-electron-bridge': noDirectElectronBridgeRule,
        'no-banned-marketing-copy': noBannedMarketingCopyRule,
        'no-raw-focus-ring': noRawFocusRingRule,
        'no-ad-hoc-currency': noAdHocCurrencyRule,
        'chat-tool-schema-strict': chatToolSchemaStrictRule,
        'canonical-ui-label-casing': canonicalUiLabelCasingRule,
        'no-hardcoded-theme-colors': noHardcodedThemeColorsRule,
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
            name: '@/components/atoms/Select',
            message: "Use Select from '@jovie/ui' instead of local atoms.",
          },
          {
            name: '@/components/atoms/Button',
            message: "Use Button from '@jovie/ui' instead of local atoms.",
          },
          {
            name: '@/components/atoms/LinearButton',
            message:
              "LinearButton was a link component. Use <Link> from 'next/link' or <Button asChild> with a Link child instead.",
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
            group: ['@clerk', '@clerk/*'],
            message:
              'Clerk is retired. Use Better Auth via @/lib/auth/better-auth and @/hooks/useJovieAuth.',
          },
          {
            group: [
              '../components/atoms/Button',
              './components/atoms/Button',
              'components/atoms/Button',
            ],
            message: "Use Button from '@jovie/ui' instead of local atoms.",
          },
          {
            group: [
              '../components/atoms/LinearButton',
              './components/atoms/LinearButton',
              'components/atoms/LinearButton',
            ],
            message:
              "LinearButton was a link component. Use <Link> from 'next/link' or <Button asChild> with a Link child instead.",
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
    // Database guardrails - Neon WebSocket driver supports transactions for RLS
    '@jovie/no-db-transaction': 'off',
    '@jovie/no-manual-db-pooling': 'error',
    // Route management - prevent hardcoded paths
    '@jovie/no-hardcoded-routes': 'error',
    '@jovie/require-query-cache-config': 'error',
    '@jovie/require-abort-signal': 'error',
    '@jovie/no-raw-motion-values': 'error',
    // Prevent renderer code from reaching past the guarded electron-bridge
    // wrapper — installed binaries may expose a partial bridge.
    '@jovie/no-direct-electron-bridge': 'error',
    // Marketing copy guardrails — prevent placeholder/internal text on public pages
    // (Scoped to app/(marketing)/** via the rule's internal file filter)
    '@jovie/no-banned-marketing-copy': 'error',
    // Design-system focus ring enforcement — interactive elements must use
    // canonical focus-ring-themed or focus-visible:* utilities
    '@jovie/no-raw-focus-ring': 'error',
    '@jovie/no-ad-hoc-currency': 'error',
    '@jovie/chat-tool-schema-strict': 'error',
    // DESIGN.md text casing — Title Case labels, sentence case body/toasts/tooltips
    '@jovie/canonical-ui-label-casing': 'error',
    // Contrast guardrail — bare text-black/bg-white without dark: counterpart (JOV-11038)
    // error at author time; contrast-ratchet counts legacy debt in CI (JOV-3572)
    '@jovie/no-hardcoded-theme-colors': 'error',
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
  // NOTE: Test file overrides for @typescript-eslint/no-explicit-any removed
  // - Biome already disables suspicious/noExplicitAny for test files
  // Enforce type-only exports in admin types barrel file
  {
    files: ['lib/admin/types.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration:not([exportKind="type"])',
          message:
            'Only type exports allowed in types.ts. Use "export type { ... }" to prevent bundling server code into client.',
        },
      ],
    },
  },

  // Disable server/client boundary rules for server-only contexts
  {
    files: ['**/app/api/**', '**/actions.ts', '**/actions/*.ts'],
    rules: {
      '@jovie/use-client-directive': 'off',
      '@jovie/server-only-imports': 'off',
    },
  },

  {
    files: ['components/atoms/**/*.tsx'],
    ignores: [
      'components/atoms/AmountSelector.tsx',
      'components/atoms/ProgressIndicator.tsx',
      'components/atoms/SocialIcon.tsx',
      'components/atoms/TruncatedText.tsx',
      'components/atoms/CopyableMonospaceCell.tsx',
      'components/atoms/TableErrorFallback.tsx',
      'components/atoms/AvatarUploadOverlay.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='Identifier'][callee.name=/^use[A-Z]/]",
          message:
            'Hooks are not allowed in atoms. Move stateful logic to a molecule or organism and keep atoms props-driven.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.type='Identifier'][callee.object.name='React'][callee.property.type='Identifier'][callee.property.name=/^use[A-Z]/]",
          message:
            'Hooks are not allowed in atoms. Move stateful logic to a molecule or organism and keep atoms props-driven.',
        },
      ],
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

  // JOV-INV-031 thread-blocking hard-gate (latency-sensitive-execution-v1).
  // Separate from route-response-latency budgets in performance-invariants-v1.
  // Author-time selectors; the CI harness also follows aliases/wrappers so a
  // helper import cannot bypass. existsSync is gray (harness-only). Existing
  // request-path debt is allowlisted in
  // scripts/invariants/latency-sensitive-execution-allowlist.json.
  {
    files: [
      'app/**/*.{ts,tsx,js,mjs}',
      'lib/**/*.{ts,tsx,js,mjs}',
      'components/**/*.{ts,tsx,js,mjs}',
      'hooks/**/*.{ts,tsx,js,mjs}',
      'middleware.ts',
      'proxy.ts',
    ],
    ignores: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.stories.*',
      '**/scripts/**',
      'components/atoms/**',
      'app/(marketing)/changelog/feed.xml/route.ts',
      'app/api/health/build-info/route.ts',
      'components/features/home/RecentlyShippedSection.tsx',
      'lib/a11y-gates/contrast-engine.ts',
      'lib/a11y-gates/touch-target-engine.ts',
      'lib/changelog-source.ts',
      'lib/chat/knowledge/topics.ts',
      'lib/eval/calibration.ts',
      'lib/hud/ovie-mac-hud.server.ts',
      'lib/hud/shipper-state.ts',
      'lib/hud/symphony-codex-accounts.server.ts',
      'lib/library-share/passphrase.ts',
      'lib/merch/artwork.ts',
      'lib/ovie/identity.ts',
      'lib/ovie/mcp/artist-profile-inventory.ts',
      'lib/seo/ratchet.ts',
      'lib/testing/quarantine-ledger.server.ts',
      'lib/utils/pii-encryption.ts',
      'lib/utils/url-encryption.server.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportSpecifier[imported.name='sql'][local.name='sql'][parent.source.value='drizzle-orm']",
          message:
            "Alias drizzle's sql as drizzleSql to avoid conflicts with Neon client.",
        },
        {
          selector:
            'CallExpression[callee.name=/^(readFileSync|writeFileSync|readdirSync|execSync|spawnSync|execFileSync|gzipSync|gunzipSync|deflateSync|inflateSync|unzipSync|brotliCompressSync|brotliDecompressSync|deflateRawSync|inflateRawSync|pbkdf2Sync|scryptSync|randomFillSync)$/]',
          message:
            'JOV-INV-031 thread-blocking: known sync I/O/crypto blocks the event loop. Use nonblocking I/O or precompute. This is not a route-response-latency budget and does not change crawler/bot wait.',
        },
        {
          selector:
            'CallExpression[callee.property.name=/^(readFileSync|writeFileSync|readdirSync|execSync|spawnSync|execFileSync|gzipSync|gunzipSync|deflateSync|inflateSync|unzipSync|brotliCompressSync|brotliDecompressSync|deflateRawSync|inflateRawSync|pbkdf2Sync|scryptSync|randomFillSync)$/]',
          message:
            'JOV-INV-031 thread-blocking: known sync I/O/crypto blocks the event loop. Aliases and members are the same violation. This is not a route-response-latency budget.',
        },
        {
          selector:
            'ImportSpecifier[imported.name=/^(readFileSync|writeFileSync|readdirSync|execSync|spawnSync|execFileSync|gzipSync|gunzipSync|deflateSync|inflateSync|unzipSync|brotliCompressSync|brotliDecompressSync|deflateRawSync|inflateRawSync|pbkdf2Sync|scryptSync|randomFillSync)$/]',
          message:
            'JOV-INV-031 thread-blocking: importing a known sync I/O/crypto API is rejected in runtime app code, including aliases. Moving the call into a helper is zero escape.',
        },
      ],
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
  // Component dependency direction enforcement
  // atoms → molecules → organisms → features (no reverse imports)
  {
    files: ['components/**/*.{ts,tsx}'],
    plugins: {
      boundaries: boundariesPlugin,
    },
    settings: {
      'boundaries/elements': [
        {
          type: 'ui-atoms',
          pattern: ['../../packages/ui/atoms/**'],
        },
        {
          type: 'atoms',
          pattern: ['components/atoms/**'],
        },
        {
          type: 'molecules',
          pattern: ['components/molecules/**'],
        },
        {
          type: 'organisms',
          pattern: ['components/organisms/**'],
        },
        {
          type: 'features',
          pattern: ['components/features/*/**'],
          capture: ['feature'],
        },
      ],
    },
    rules: {
      // atoms cannot import from molecules, organisms, or features
      'boundaries/element-types': [
        'warn',
        {
          default: 'allow',
          rules: [
            {
              from: ['atoms'],
              disallow: ['molecules', 'organisms', 'features'],
              message:
                'Atoms cannot import from molecules, organisms, or features. Keep atoms props-driven.',
            },
            {
              from: ['molecules'],
              disallow: ['organisms', 'features'],
              message:
                'Molecules cannot import from organisms or features. Compose only from atoms.',
            },
            // TODO: Add cross-feature import ban when eslint-plugin-boundaries
            // supports capture-based disallow syntax in flat config
          ],
        },
      ],
    },
  },
  // JOV-2168: Deferred no-ad-hoc-currency violations — each suppressed here pending
  // migration to the canonical formatter (see linked issue for per-file rationale).
  {
    files: [
      'lib/chat/system-prompt.ts',
      'components/organisms/billing/PlanComparisonSection.tsx',
      'components/molecules/PaySelector.tsx',
      'app/investor-portal/_components/FundraiseProgress.tsx',
      'app/onboarding/checkout/OnboardingCheckoutClient.tsx',
    ],
    rules: {
      '@jovie/no-ad-hoc-currency': 'off',
    },
  },
  // Experimental shell routes — not production UI; label-casing ratchet deferred (#11251).
  {
    files: ['**/app/exp/**/*.{ts,tsx}'],
    rules: {
      '@jovie/canonical-ui-label-casing': 'off',
      '@jovie/no-hardcoded-theme-colors': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,mjs,mts,cts}'],
    languageOptions: {
      // Next's default parser crashes on module-style config and support files
      // under ESLint 10.2.1. Reuse the TypeScript parser here so plain JS/ESM
      // scripts keep lint coverage.
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
];
