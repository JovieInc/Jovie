/**
 * Unit tests for the no-ad-hoc-currency ESLint rule.
 *
 * Uses ESLint's RuleTester with flat-config format (ESLint 10+).
 * Wraps RuleTester in explicit describe/it blocks since Vitest runs
 * with globals:false in this project.
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-ad-hoc-currency.js');

// Wire RuleTester to use Vitest's describe/it (needed when globals:false)
RuleTester.describe = describe as typeof RuleTester.describe;
RuleTester.it = it as typeof RuleTester.it;

// ESLint 10 uses flat config format — use `languageOptions` instead of `parserOptions`
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

ruleTester.run('no-ad-hoc-currency', rule, {
  valid: [
    // Canonical cent formatter — no violation
    {
      code: `const display = formatAmount(cents);`,
    },
    // Canonical admin USD formatter — no violation
    {
      code: `const display = formatUsd(value);`,
    },
    // toFixed not preceded by a $ quasi — not currency
    {
      code: `const s = \`\${ratio.toFixed(2)}:1\`;`,
    },
    // toFixed in a non-$ template — file size, lat/lng, etc.
    {
      code: `const size = \`\${(bytes / 1024).toFixed(2)} MB\`;`,
    },
    // $ in template but expression has no toFixed — ambiguous, don't flag
    {
      code: `const label = \`$\${amount}\`;`,
    },
    // formatPercent with toFixed — not currency (no $ quasi before it)
    {
      code: `const pct = \`\${(rate * 100).toFixed(1)}%\`;`,
    },
  ],

  invalid: [
    // Classic cents-to-dollars pattern
    {
      code: `const display = \`$\${(cents / 100).toFixed(2)}\`;`,
      errors: [{ messageId: 'noAdHocCurrency' }],
    },
    // Direct toFixed on an already-dollar value
    {
      code: `const display = \`$\${amount.toFixed(2)}\`;`,
      errors: [{ messageId: 'noAdHocCurrency' }],
    },
    // toFixed with 0 decimal places but preceded by $
    {
      code: `const display = \`$\${(cents / 100).toFixed(0)}\`;`,
      errors: [{ messageId: 'noAdHocCurrency' }],
    },
    // Longer prefix string ending with $
    {
      code: `const msg = \`Total: $\${(value).toFixed(2)}\`;`,
      errors: [{ messageId: 'noAdHocCurrency' }],
    },
    // Variable declared inside function with $ prefix and toFixed
    {
      code: `function fmt(v) { return \`$\${v.toFixed(2)}\`; }`,
      errors: [{ messageId: 'noAdHocCurrency' }],
    },
  ],
});
