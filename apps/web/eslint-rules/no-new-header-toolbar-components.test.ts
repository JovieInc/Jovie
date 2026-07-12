/**
 * Unit tests for the no-new-header-toolbar-components ESLint rule.
 *
 * Warns (does not error) when a *Header.tsx / *Toolbar.tsx file under
 * apps/web/components/** is not on the frozen allowlist. Existing files
 * must stay silent; a new, non-allowlisted file must warn.
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-new-header-toolbar-components.js');

RuleTester.describe = describe as typeof RuleTester.describe;
RuleTester.it = it as typeof RuleTester.it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

ruleTester.run('no-new-header-toolbar-components', rule, {
  valid: [
    // Allowlisted existing file — silent
    {
      code: `export function DashboardHeader() { return null; }`,
      filename:
        '/repo/apps/web/components/features/dashboard/organisms/DashboardHeader.tsx',
    },
    {
      code: `export function PageToolbar() { return null; }`,
      filename:
        '/repo/apps/web/components/organisms/table/molecules/PageToolbar.tsx',
    },
    // Not a Header/Toolbar filename — never checked
    {
      code: `export function DashboardNav() { return null; }`,
      filename:
        '/repo/apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx',
    },
    // Header/Toolbar filename outside apps/web/components — not checked
    {
      code: `export function SomeHeader() { return null; }`,
      filename: '/repo/apps/web/lib/SomeHeader.tsx',
    },
    // Header/Toolbar filename outside apps/web entirely — not checked
    {
      code: `export function OtherHeader() { return null; }`,
      filename: '/repo/apps/ios/components/OtherHeader.tsx',
    },
  ],

  invalid: [
    // New, non-allowlisted Header component
    {
      code: `export function BrandNewHeader() { return null; }`,
      filename:
        '/repo/apps/web/components/features/dashboard/organisms/BrandNewHeader.tsx',
      errors: [{ messageId: 'notAllowlisted' }],
    },
    // New, non-allowlisted Toolbar component
    {
      code: `export function BrandNewToolbar() { return null; }`,
      filename: '/repo/apps/web/components/molecules/BrandNewToolbar.tsx',
      errors: [{ messageId: 'notAllowlisted' }],
    },
  ],
});
