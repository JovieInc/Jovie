/**
 * Unit tests for the no-direct-stripe-client ESLint rule (JOV-6043).
 *
 * Uses ESLint's RuleTester with flat-config format (ESLint 10+).
 * Wraps RuleTester in explicit describe/it blocks since Vitest runs
 * with globals:false in this project.
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const tsParser = require('@typescript-eslint/parser');
const rule = require('./no-direct-stripe-client.js');

RuleTester.describe = describe as typeof RuleTester.describe;
RuleTester.it = it as typeof RuleTester.it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2020,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

ruleTester.run('no-direct-stripe-client', rule, {
  valid: [
    // Canonical adapter — the intended call site
    {
      code: `import { stripe } from '@/lib/stripe/client';`,
      filename: '/repo/apps/web/app/api/billing/checkout-session/route.ts',
    },
    // Type-only imports are allowed anywhere
    {
      code: `import type Stripe from 'stripe';`,
      filename: '/repo/apps/web/app/api/billing/checkout-session/route.ts',
    },
    {
      code: `import type { Stripe } from 'stripe';`,
      filename: '/repo/apps/web/lib/billing/reconciliation/batch-processor.ts',
    },
    // The canonical client directory may use the SDK directly
    {
      code: `import Stripe from 'stripe'; export const stripe = new Stripe(key);`,
      filename: '/repo/apps/web/lib/stripe/client.ts',
    },
    {
      code: `const Stripe = require('stripe');`,
      filename: '/repo/apps/web/lib/stripe/retry.ts',
    },
    // Tests and scripts may construct their own clients
    {
      code: `import Stripe from 'stripe';`,
      filename: '/repo/apps/web/tests/e2e/helpers/stripe-helpers.ts',
    },
    {
      code: `import Stripe from 'stripe';`,
      filename: '/repo/apps/web/lib/email/paid-welcome.test.ts',
    },
    {
      code: `const Stripe = require('stripe');`,
      filename: '/repo/apps/web/scripts/backfill-stripe.ts',
    },
    // Unrelated imports and constructors
    {
      code: `import { db } from '@/lib/db'; const s = new Something();`,
      filename: '/repo/apps/web/app/api/tips/route.ts',
    },
  ],

  invalid: [
    // Runtime default import in an app route — the bypass this rule exists for
    {
      code: `import Stripe from 'stripe';`,
      filename: '/repo/apps/web/app/api/webhooks/stripe-tips/route.ts',
      errors: [{ messageId: 'forbiddenImport' }],
    },
    // Namespace import still performs a runtime import
    {
      code: `import * as Stripe from 'stripe';`,
      filename: '/repo/apps/web/lib/admin/metrics.ts',
      errors: [{ messageId: 'forbiddenImport' }],
    },
    // Subpath imports are SDK access too
    {
      code: `import Stripe from 'stripe/esm';`,
      filename: '/repo/apps/web/app/api/tips/route.ts',
      errors: [{ messageId: 'forbiddenImport' }],
    },
    // require() bypass
    {
      code: `const Stripe = require('stripe');`,
      filename: '/repo/apps/web/lib/merch/orders.ts',
      errors: [{ messageId: 'forbiddenRequire' }],
    },
    // Full bypass pattern: import + construct in a forbidden file reports both
    {
      code: `import Stripe from 'stripe'; const s = new Stripe(key);`,
      filename: '/repo/apps/web/app/api/checkout/route.ts',
      errors: [
        { messageId: 'forbiddenImport' },
        { messageId: 'forbiddenConstructor' },
      ],
    },
  ],
});
