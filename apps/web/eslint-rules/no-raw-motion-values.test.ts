/**
 * Unit tests for the no-raw-motion-values ESLint rule.
 *
 * Covers the original raw-motion-token checks plus the motion-lint
 * extension (#13641): transition:all inline, ease-in, scale(0) entries,
 * raw seconds / >300ms Framer durations, interaction-triggered keyframes,
 * unguarded :hover CSS blocks, and Framer Motion x/y shorthands.
 *
 * Uses ESLint's RuleTester with flat-config format.
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-raw-motion-values.js');

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

// The rule allowlists *.test.* paths, so give test cases a production-like
// filename to exercise the checks.
const filename = '/repo/apps/web/components/atoms/Example.tsx';
const grandfatheredFilename =
  '/repo/apps/web/components/organisms/billing/BillingHeader.tsx';

ruleTester.run('no-raw-motion-values', rule, {
  valid: [
    // ── canonical tokens ─────────────────────────────────────────────────────
    {
      filename,
      code: `const el = <div className='transition-colors duration-subtle ease-subtle' />;`,
    },
    {
      filename,
      code: `const el = <div style={{ transitionDuration: 'var(--ds-motion-subtle-duration)' }} />;`,
    },
    // ── ease-in-out is NOT ease-in ───────────────────────────────────────────
    {
      filename,
      code: `const el = <div className='transition-opacity ease-in-out' />;`,
    },
    {
      filename,
      code: `const el = <div style={{ transitionTimingFunction: 'ease-in-out' }} />;`,
    },
    // ease-initial-like tokens don't match
    {
      filename,
      code: `const el = <div className='ease-linear' />;`,
    },
    // ── scale resets and non-zero scales are fine ────────────────────────────
    {
      filename,
      code: `const el = <div className='scale-100' />;`,
    },
    {
      filename,
      code: `const el = <div className='scale-95' />;`,
    },
    {
      filename,
      code: `const el = <div style={{ transform: 'scale(0.95)' }} />;`,
    },
    // ── keyframes: loaders and non-interaction keyframes are allowed ─────────
    {
      filename,
      code: `const el = <div className='animate-spin' />;`,
    },
    {
      filename,
      code: `const el = <div className='animate-[menu-in_150ms_ease-out_both]' />;`,
    },
    // ── :hover guarded by media query ────────────────────────────────────────
    {
      filename,
      code: 'const css = `@media (hover: hover) and (pointer: fine) { .btn:hover { opacity: 0.8; } }`;',
    },
    // hover: Tailwind variant (not a CSS :hover block)
    {
      filename,
      code: `const el = <div className='hover:bg-surface-1 md:hover:opacity-80' />;`,
    },
    // ── Framer Motion: transform strings + short durations are fine ─────────
    {
      filename,
      code: `const el = <motion.div initial={{ opacity: 0, transform: 'translateY(8px)' }} transition={{ duration: 0.15 }} />;`,
    },
    // duration exactly at the 300ms ceiling
    {
      filename,
      code: `const el = <motion.div transition={{ duration: 0.3, ease: 'easeOut' }} />;`,
    },
    // x/y props on NON-motion components (charts etc.) are not flagged
    {
      filename,
      code: `const el = <Rect animate={{ x: 10, y: 20 }} />;`,
    },
    {
      filename,
      code: `const el = <ScatterPoint x={4} y={2} />;`,
    },
    // ── transition property lists (no `all`) ─────────────────────────────────
    {
      filename,
      code: `const el = <div style={{ transitionProperty: 'opacity, transform' }} />;`,
    },
    // 'all' inside a longer word is not transition:all
    {
      filename,
      code: `const el = <div style={{ transition: 'tallness var(--ds-motion-subtle-duration)' }} />;`,
    },
    // ── grandfathered file: pre-existing framer x/y + long durations pass ───
    {
      filename: grandfatheredFilename,
      code: `const el = <motion.div animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} />;`,
    },
    // grandfathered file: raw seconds in inline style passes (ratchet)
    {
      filename: grandfatheredFilename,
      code: `const el = <div style={{ transition: 'opacity 0.4s var(--ds-motion-cinematic-easing)' }} />;`,
    },
    // allowlisted paths are skipped entirely
    {
      filename: '/repo/apps/web/app/exp/dev-overlay/page.tsx',
      code: `const el = <div style={{ transition: 'all 220ms ease-in' }} />;`,
    },
  ],

  invalid: [
    // ── original checks still fire ───────────────────────────────────────────
    {
      filename,
      code: `const el = <div className='transition-all duration-300' />;`,
      errors: [
        { messageId: 'transitionAll' },
        { messageId: 'numericDurationClass' },
      ],
    },
    {
      filename,
      code: `const el = <div style={{ transitionDuration: '300ms' }} />;`,
      errors: [{ messageId: 'rawMsDuration' }],
    },
    {
      filename,
      code: `const el = <div style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }} />;`,
      errors: [{ messageId: 'rawCubicBezier' }],
    },
    {
      filename,
      code: `const el = <div className='hover:scale-105' />;`,
      errors: [{ messageId: 'decorativeHoverMotion' }],
    },
    // ── transition: all (inline shorthand) ───────────────────────────────────
    {
      filename,
      code: `const el = <div style={{ transition: 'all 150ms ease-out' }} />;`,
      errors: [
        { messageId: 'rawMsDuration' },
        { messageId: 'transitionAllInline' },
      ],
    },
    {
      filename,
      code: `const el = <div style={{ transition: 'all var(--ds-motion-subtle-duration)' }} />;`,
      errors: [{ messageId: 'transitionAllInline' }],
    },
    // transitionProperty: 'all'
    {
      filename,
      code: `const el = <div style={{ transitionProperty: 'all' }} />;`,
      errors: [{ messageId: 'transitionAllInline' }],
    },
    // ── ease-in ──────────────────────────────────────────────────────────────
    {
      filename,
      code: `const el = <div className='transition-opacity ease-in duration-subtle' />;`,
      errors: [{ messageId: 'easeInClass' }],
    },
    {
      filename,
      code: `const el = <div style={{ transitionTimingFunction: 'ease-in' }} />;`,
      errors: [{ messageId: 'easeInInline' }],
    },
    // Framer ease: 'easeIn'
    {
      filename,
      code: `const el = <motion.div transition={{ duration: 0.2, ease: 'easeIn' }} />;`,
      errors: [{ messageId: 'easeInInline' }],
    },
    // ── scale(0) entry animations ────────────────────────────────────────────
    {
      filename,
      code: `const el = <div className='scale-0 transition-transform' />;`,
      errors: [{ messageId: 'scaleZeroEntry' }],
    },
    {
      filename,
      code: `const el = <div style={{ transform: 'scale(0)' }} />;`,
      errors: [{ messageId: 'scaleZeroEntry' }],
    },
    {
      filename,
      code: `const el = <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} />;`,
      errors: [{ messageId: 'scaleZeroEntry' }],
    },
    // ── durations >300ms / raw seconds ──────────────────────────────────────
    {
      filename,
      code: `const el = <motion.div transition={{ duration: 0.5 }} />;`,
      errors: [{ messageId: 'longFramerDuration' }],
    },
    {
      filename,
      code: `const el = <div style={{ transition: 'opacity 0.6s ease-out' }} />;`,
      errors: [{ messageId: 'rawSecondsDuration' }],
    },
    {
      filename,
      code: `const el = <div style={{ animationDuration: '2s' }} />;`,
      errors: [{ messageId: 'rawSecondsDuration' }],
    },
    // ── keyframes on interruptible interaction states ────────────────────────
    {
      filename,
      code: `const el = <div className='hover:animate-[wiggle_200ms_ease-out]' />;`,
      errors: [{ messageId: 'interruptibleKeyframes' }],
    },
    {
      filename,
      code: `const el = <div className='data-[state=open]:animate-[pop_150ms_ease-out]' />;`,
      errors: [{ messageId: 'interruptibleKeyframes' }],
    },
    // ── :hover without media guard ──────────────────────────────────────────
    {
      filename,
      code: 'const css = `.card:hover { transform: none; opacity: 0.9; }`;',
      errors: [{ messageId: 'hoverWithoutMediaGuard' }],
    },
    {
      filename,
      code: `const css = '.btn:hover, .btn:focus { opacity: 0.8; }';`,
      errors: [{ messageId: 'hoverWithoutMediaGuard' }],
    },
    // ── Framer Motion x/y shorthands ─────────────────────────────────────────
    {
      filename,
      code: `const el = <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} />;`,
      errors: [
        { messageId: 'framerAxisShorthand' },
        { messageId: 'framerAxisShorthand' },
      ],
    },
    {
      filename,
      code: `const el = <m.span whileHover={{ x: 4 }} />;`,
      errors: [{ messageId: 'framerAxisShorthand' }],
    },
    // grandfathered file: NEW-check exemption does not exempt original checks
    {
      filename: grandfatheredFilename,
      code: `const el = <div className='transition-all' />;`,
      errors: [{ messageId: 'transitionAll' }],
    },
    // grandfathered file: scale(0) entry is NOT grandfathered (zero prior hits)
    {
      filename: grandfatheredFilename,
      code: `const el = <motion.div initial={{ scale: 0 }} />;`,
      errors: [{ messageId: 'scaleZeroEntry' }],
    },
  ],
});
