/**
 * Unit tests for the no-hardcoded-theme-colors ESLint rule.
 *
 * The rule flags Tailwind classes that cause contrast failures when the theme flips:
 *   - `text-black` / `bg-white` without a `dark:` counterpart (black-on-black in dark mode)
 *   - `text-[#hex]` / `bg-[#hex]` without a `dark:` counterpart (JOV-11025)
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
    // Hex with dark counterpart — explicitly paired, allowed
    {
      code: `const el = <div className='text-[#000000] dark:text-white' />;`,
    },
    // Hex bg with dark counterpart
    {
      code: `const el = <div className='bg-[#ffffff] dark:bg-surface-0' />;`,
    },
    // Hex with opacity modifier — intentional overlay (not an absolute color)
    {
      code: `const el = <div className='bg-[#06070a]/96 text-white' />;`,
    },
    // Hex with opacity modifier on text
    {
      code: `const el = <div className='text-[#000000]/40' />;`,
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
    // Hardcoded hex text without dark counterpart (JOV-11025)
    {
      code: `const el = <div className='text-[#000000]' />;`,
      errors: [{ messageId: 'bareHexText' }],
    },
    // Hardcoded hex text among other classes, no dark counterpart
    {
      code: `const el = <div className='font-bold text-[#121216] px-4' />;`,
      errors: [{ messageId: 'bareHexText' }],
    },
    // Hardcoded short hex text
    {
      code: `const el = <div className='text-[#000]' />;`,
      errors: [{ messageId: 'bareHexText' }],
    },
    // Hardcoded hex background without dark counterpart
    {
      code: `const el = <div className='bg-[#ffffff] p-4' />;`,
      errors: [{ messageId: 'bareHexBg' }],
    },
    // Hardcoded hex bg in cn() without dark counterpart
    {
      code: `const el = <div className={cn('bg-[#f5f5f7] rounded', extra)} />;`,
      errors: [{ messageId: 'bareHexBg' }],
    },
    // Hardcoded hex text in template literal
    {
      code: `const el = <div className={\`text-[#8A8F98] \${extra}\`} />;`,
      errors: [{ messageId: 'bareHexText' }],
    },
  ],
});
