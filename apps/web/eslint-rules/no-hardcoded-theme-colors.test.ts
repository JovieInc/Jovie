/**
 * Unit tests for the no-hardcoded-theme-colors ESLint rule.
 *
 * The rule flags raw Tailwind color utilities that bypass the System B token
 * layer and can cause invisible-text contrast failures across themes:
 *
 *   text-black / text-white — absolute text colors without a dark: counterpart
 *   bg-white   / bg-black  — absolute bg colors without a dark: counterpart
 *   text-[#hex] / bg-[#hex] / border-[#hex] — arbitrary hex always banned
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
    // ── text-black ────────────────────────────────────────────────────────────
    // Has dark counterpart — correct dual-mode theming
    { code: `const el = <div className='text-black dark:text-white p-4' />;` },
    // dark: only — explicit dark-mode surface
    { code: `const el = <div className='dark:text-white' />;` },
    // Semantic token — adapts automatically
    { code: `const el = <div className='text-foreground' />;` },
    // Opacity modifier — intentional overlay (not an absolute color)
    { code: `const el = <div className='text-black/20' />;` },
    // text-black with dark: in template
    {
      code: `const el = <div className={\`text-black dark:text-white \${x}\`} />;`,
    },
    // text-black in cn() with dark counterpart
    {
      code: `const el = <div className={cn('text-black dark:text-white', x)} />;`,
    },

    // ── text-white ────────────────────────────────────────────────────────────
    // Has dark counterpart
    { code: `const el = <div className='text-white dark:text-black' />;` },
    // dark: only
    { code: `const el = <div className='dark:text-black' />;` },
    // Opacity modifier — intentional overlay
    { code: `const el = <div className='text-white/5 bg-black/50' />;` },
    { code: `const el = <div className='text-white/70 font-semibold' />;` },

    // ── bg-white ──────────────────────────────────────────────────────────────
    { code: `const el = <div className='bg-white dark:bg-surface-1' />;` },
    // Opacity modifier
    { code: `const el = <div className='bg-white/5' />;` },
    { code: `const el = <div className='bg-white/[0.03]' />;` },

    // ── bg-black ──────────────────────────────────────────────────────────────
    { code: `const el = <div className='bg-black dark:bg-surface-0' />;` },
    // Opacity modifier — overlay
    { code: `const el = <div className='bg-black/20' />;` },
    { code: `const el = <div className='bg-black/[0.5]' />;` },

    // ── Non-className attribute — not checked ─────────────────────────────────
    { code: `const el = <div style={{ color: 'black' }} />;` },

    // ── Semantic tokens — always allowed ──────────────────────────────────────
    { code: `const el = <div className='text-primary-token bg-surface-1' />;` },
    {
      code: `const el = <div className='text-muted-foreground border-border' />;`,
    },
  ],

  invalid: [
    // ── text-black ────────────────────────────────────────────────────────────
    {
      code: `const el = <div className='text-black' />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    {
      code: `const el = <div className='font-bold text-black px-4' />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    {
      code: `const el = <div className={cn('text-black rounded', x)} />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    {
      code: `const el = <div className={isActive ? 'text-black' : 'text-muted'} />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },
    {
      code: `const el = <div className={\`text-black \${x}\`} />;`,
      errors: [{ messageId: 'bareTextBlack' }],
    },

    // ── text-white ────────────────────────────────────────────────────────────
    {
      code: `const el = <div className='text-white' />;`,
      errors: [{ messageId: 'bareTextWhite' }],
    },
    {
      code: `const el = <div className='font-bold text-white px-4' />;`,
      errors: [{ messageId: 'bareTextWhite' }],
    },
    {
      code: `const el = <div className={cn('text-white rounded', x)} />;`,
      errors: [{ messageId: 'bareTextWhite' }],
    },
    {
      code: `const el = <div className={isActive ? 'text-white' : 'text-muted'} />;`,
      errors: [{ messageId: 'bareTextWhite' }],
    },

    // ── bg-white ──────────────────────────────────────────────────────────────
    {
      code: `const el = <div className='bg-white px-4' />;`,
      errors: [{ messageId: 'bareBgWhite' }],
    },
    {
      code: `const el = <div className={cn('bg-white', x)} />;`,
      errors: [{ messageId: 'bareBgWhite' }],
    },

    // ── bg-black ──────────────────────────────────────────────────────────────
    {
      code: `const el = <div className='bg-black p-4' />;`,
      errors: [{ messageId: 'bareBgBlack' }],
    },
    {
      code: `const el = <div className='rounded bg-black' />;`,
      errors: [{ messageId: 'bareBgBlack' }],
    },
    {
      code: `const el = <div className={cn('bg-black', x)} />;`,
      errors: [{ messageId: 'bareBgBlack' }],
    },

    // ── arbitrary hex colors ─────────────────────────────────────────────────
    {
      code: `const el = <div className='text-[#fff]' />;`,
      errors: [{ messageId: 'arbitraryHexColor' }],
    },
    {
      code: `const el = <div className='bg-[#000000] p-4' />;`,
      errors: [{ messageId: 'arbitraryHexColor' }],
    },
    {
      code: `const el = <div className='border-[#aabbcc]' />;`,
      errors: [{ messageId: 'arbitraryHexColor' }],
    },
    {
      code: `const el = <div className='text-[#ffffff99]' />;`,
      errors: [{ messageId: 'arbitraryHexColor' }],
    },
    {
      code: `const el = <div className={cn('rounded text-[#3a3a3a]', x)} />;`,
      errors: [{ messageId: 'arbitraryHexColor' }],
    },
    // Arbitrary hex is flagged even when a dark: pair is present
    {
      code: `const el = <div className='text-[#fff] dark:text-[#000]' />;`,
      errors: [{ messageId: 'arbitraryHexColor' }],
    },
  ],
});
