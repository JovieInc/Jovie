/**
 * Unit tests for the ui-feel ESLint rule (JOV-8196).
 *
 * Covers the four deterministic checks: tabular-nums on changing numerals,
 * text-wrap: balance on headings, the 40x40 hit-area floor on interactive
 * elements, and concentric border radii (System B token order).
 * True-positive and true-negative fixtures per check.
 *
 * Uses ESLint's RuleTester with flat-config format.
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./ui-feel.js');

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

// The rule skips *.test.* / *.stories.* paths — use a production-like name.
const filename = '/repo/apps/web/components/atoms/Example.tsx';

ruleTester.run('ui-feel', rule, {
  valid: [
    // ── tabular-nums ───────────────────────────────────────────────────────
    {
      filename,
      code: `const el = <span className='tabular-nums'>{count}</span>;`,
    },
    {
      filename,
      code: `const el = <td className='tabular-nums'>{value.toLocaleString()}</td>;`,
    },
    {
      filename,
      code: `const el = <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>;`,
    },
    // Non-numeric content is not a changing numeral.
    {
      filename,
      code: `const el = <span>{label}</span>;`,
    },
    {
      filename,
      code: `const el = <p>Plays today</p>;`,
    },
    // Mixed prose + number is body copy, not a numeral display.
    {
      filename,
      code: `const el = <p>{count} new fans</p>;`,
    },
    // JSX-producing expressions are not numeral displays.
    {
      filename,
      code: `const el = <div>{items.map(i => <span key={i}>{i}</span>)}</div>;`,
    },
    // Dynamic className is out of scope — can't reason statically.
    {
      filename,
      code: `const el = <span className={clsx('stat', tone)}>{count}</span>;`,
    },
    // ── text-wrap balance ──────────────────────────────────────────────────
    {
      filename,
      code: `const el = <h1 className='text-balance text-4xl'>Title here</h1>;`,
    },
    {
      filename,
      code: `const el = <h2 className='text-pretty'>Title</h2>;`,
    },
    {
      filename,
      code: `const el = <h2 style={{ textWrap: 'balance' }}>Title</h2>;`,
    },
    // Single-line intents are exempt.
    {
      filename,
      code: `const el = <h3 className='truncate'>Title</h3>;`,
    },
    {
      filename,
      code: `const el = <h3 className='whitespace-nowrap'>Title</h3>;`,
    },
    {
      filename,
      code: `const el = <h1 className='sr-only'>Accessible title</h1>;`,
    },
    // Non-heading elements are out of scope.
    {
      filename,
      code: `const el = <p className='text-lg'>Body copy that wraps.</p>;`,
    },
    // ── hit-area ───────────────────────────────────────────────────────────
    {
      filename,
      code: `const el = <button className='h-11 w-11'>x</button>;`,
    },
    {
      filename,
      code: `const el = <button className='size-10'>x</button>;`,
    },
    // 44px hit container around a smaller visible icon (canonical rescue).
    {
      filename,
      code: `const el = <button className='relative size-6 before:absolute before:h-11 before:min-w-11 before:content-[""]'>x</button>;`,
    },
    {
      filename,
      code: `const el = <a href='/x' className='size-8 min-h-10 min-w-10'>x</a>;`,
    },
    // Width unconstrained → not provably under 40x40.
    {
      filename,
      code: `const el = <button className='h-8 w-full'>Save</button>;`,
    },
    // Non-interactive small boxes are out of scope.
    {
      filename,
      code: `const el = <div className='size-4' />;`,
    },
    // ── concentric radii ───────────────────────────────────────────────────
    {
      filename,
      code: `const el = <div className='rounded-lg p-4'><div className='rounded-md' /></div>;`,
    },
    {
      filename,
      code: `const el = <div className='rounded-md'><div className='rounded-sm' /></div>;`,
    },
    // Equal radius is allowed by this check (only provably-larger flags).
    {
      filename,
      code: `const el = <div className='rounded-lg'><div className='rounded-lg' /></div>;`,
    },
    // Circular avatars/dots inside cards are intentionally round.
    {
      filename,
      code: `const el = <div className='rounded-md'><div className='rounded-full' /></div>;`,
    },
    // Corner-specific utilities are ignored.
    {
      filename,
      code: `const el = <div className='rounded-sm'><div className='rounded-t-xl' /></div>;`,
    },
    // Non-nested matching radii.
    {
      filename,
      code: `const el = <div><div className='rounded-xl'><span /></div></div>;`,
    },
  ],
  invalid: [
    // ── tabular-nums ───────────────────────────────────────────────────────
    {
      filename,
      code: `const el = <span>{count}</span>;`,
      errors: [{ messageId: 'missingTabularNums' }],
    },
    {
      filename,
      code: `const el = <div>{value.toLocaleString()}</div>;`,
      errors: [{ messageId: 'missingTabularNums' }],
    },
    {
      filename,
      code: `const el = <td>{Intl.NumberFormat('en').format(total)}</td>;`,
      errors: [{ messageId: 'missingTabularNums' }],
    },
    {
      filename,
      code: `const el = <output>{secondsRemaining}</output>;`,
      errors: [{ messageId: 'missingTabularNums' }],
    },
    {
      filename,
      code: `const el = <span>{pageIndex + 1}</span>;`,
      errors: [{ messageId: 'missingTabularNums' }],
    },
    // ── text-wrap balance ──────────────────────────────────────────────────
    {
      filename,
      code: `const el = <h1 className='text-4xl font-bold'>Marketing headline</h1>;`,
      errors: [{ messageId: 'headingNeedsBalance' }],
    },
    {
      filename,
      code: `const el = <h3>Subtitle</h3>;`,
      errors: [{ messageId: 'headingNeedsBalance' }],
    },
    {
      filename,
      code: `const el = <h6 className='uppercase tracking-wide'>Eyebrow</h6>;`,
      errors: [{ messageId: 'headingNeedsBalance' }],
    },
    // ── hit-area ───────────────────────────────────────────────────────────
    {
      filename,
      code: `const el = <button className='size-6'>x</button>;`,
      errors: [{ messageId: 'undersizedHitArea' }],
    },
    {
      filename,
      code: `const el = <button className='h-8 w-8'>x</button>;`,
      errors: [{ messageId: 'undersizedHitArea' }],
    },
    {
      filename,
      code: `const el = <a href='/x' className='h-[36px] w-[36px]'>x</a>;`,
      errors: [{ messageId: 'undersizedHitArea' }],
    },
    {
      filename,
      code: `const el = <div role='button' onClick={go} className='size-9' />;`,
      errors: [{ messageId: 'undersizedHitArea' }],
    },
    // ── concentric radii ───────────────────────────────────────────────────
    {
      filename,
      code: `const el = <div className='rounded-md p-4'><div className='rounded-xl' /></div>;`,
      errors: [{ messageId: 'nonConcentricRadius' }],
    },
    {
      filename,
      code: `const el = <div className='rounded'><div className='rounded-lg' /></div>;`,
      errors: [{ messageId: 'nonConcentricRadius' }],
    },
    {
      filename,
      code: `const el = <div className='rounded-[8px]'><div className='rounded-[16px]' /></div>;`,
      errors: [{ messageId: 'nonConcentricRadius' }],
    },
  ],
});
