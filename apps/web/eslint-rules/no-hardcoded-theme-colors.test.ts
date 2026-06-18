/**
 * Unit tests for the no-hardcoded-theme-colors ESLint rule.
 *
 * The rule flags `text-black` and `bg-white` Tailwind classes that appear
 * WITHOUT a `dark:` counterpart in the same class string — these cause
 * invisible text in dark mode (black-on-black contrast failure).
 *
 * Uses ESLint's RuleTester with flat-config format (ESLint 10+).
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-hardcoded-theme-colors.js');

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

ruleTester.run('no-hardcoded-theme-colors', rule, {
  valid: [
    // Has dark counterpart — correct dual-mode theming
    {
      code: `const el = <div className='text-black dark:text-white p-4' />;`,
    },
    // Semantic token — adapts automatically
    {
      code: `const el = <div className='text-primary-token' />;`,
    },
    // dark: only class — explicit intent for dark-mode surfaces
    {
      code: `const el = <div className='dark:text-white' />;`,
    },
    // bg-white with dark counterpart — correct
    {
      code: `const el = <div className='bg-white dark:bg-surface-1' />;`,
    },
    // Opacity modifier — intentional overlay pattern (not absolute color)
    {
      code: `const el = <div className='bg-white/5 text-white/70' />;`,
    },
    // bg-white/[0.03] — opacity-modified, allowed
    {
      code: `const el = <div className='bg-white/[0.03]' />;`,
    },
    // text-black in a template with dark counterpart
    {
      code: `const el = <div className={\`text-black dark:text-white \${extra}\`} />;`,
    },
    // Non-className attribute — not checked
    {
      code: `const el = <div style={{ color: 'black' }} />;`,
    },
    // text-black in cn() with dark counterpart
    {
      code: `const el = <div className={cn('text-black dark:text-white', extra)} />;`,
    },
  ],

  invalid: [
    // Bare text-black — no dark counterpart
    {
      code: `const el = <div className='text-black' />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    // text-black with other classes but still no dark:text-
    {
      code: `const el = <div className='font-bold text-black px-4' />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    // Bare bg-white — no dark counterpart
    {
      code: `const el = <div className='bg-white px-4' />;`,
      errors: [{ messageId: 'bareBgWhite' }],
    },
    // cn() call with bare text-black
    {
      code: `const el = <div className={cn('text-black rounded', extra)} />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    // Conditional expression, one branch bare
    {
      code: `const el = <div className={isActive ? 'text-black' : 'text-muted'} />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    // Template literal without dark counterpart
    {
      code: `const el = <div className={\`text-black \${extra}\`} />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
  ],
});
