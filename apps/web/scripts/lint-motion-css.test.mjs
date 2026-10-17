/**
 * Unit tests for the lint-motion-css stylesheet scanner.
 *
 * Mirrors eslint-rules/no-raw-motion-values.test.ts: a valid/invalid table of
 * CSS sources where each invalid case declares the expected messageIds, so the
 * stylesheet-side checks (transition:all, will-change:all, raw ms/s durations)
 * stay in lockstep with the JSX-side rule's semantics.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintCssSource, shouldScanFile } from './lint-motion-css.mjs';

// The scanner allowlists *.test.*/styles/ paths, so give cases a
// production-like filename to exercise the checks.
const filename = 'apps/web/components/atoms/Example.css';
const grandfatheredFilename = 'apps/web/app/globals.css';
const migratedFiles = [
  'app/(marketing)/changelog/changelog-editorial.css',
  'components/organisms/HeaderNav.css',
  'components/site/MarketingFooter.css',
];

const run = (code, file = filename) =>
  lintCssSource(code, file).map(v => v.messageId);

const valid = [
  // ── canonical tokens ───────────────────────────────────────────────────
  '.btn { transition: color var(--duration-subtle) var(--ease-subtle); }',
  '.btn { transition: opacity var(--ds-motion-subtle-duration) var(--ds-motion-subtle-easing); }',
  '.card { transition-property: opacity, transform; }',
  // ── will-change naming real properties is fine ─────────────────────────
  '.pane { will-change: transform; }',
  '.pane { will-change: transform, opacity; }',
  // ── 'all' inside a longer word / non-motion property is not flagged ────
  '.label { transition: tallness var(--duration-subtle); }',
  '.chip { border-radius: 4px; }',
  // ── selectors named .transition-all are not the transition property ────
  '@media (prefers-reduced-motion: reduce) { .transition-all, .fade { opacity: 1; } }',
  // ── comments are ignored ───────────────────────────────────────────────
  '/* never transition:all here — see DESIGN.md */ .a { color: red; }',
  '/* will-change: all */ .b { opacity: 1; }',
  // ── custom properties define tokens; they are not duration usage ───────
  ':root { --motion-reveal-duration: 220ms; }',
  '.x { transition: color var(--motion-reveal-duration); }',
  // ── ease keywords without raw durations ────────────────────────────────
  '.y { transition: opacity ease-out; }',
  '.z { animation: spin linear infinite; }',
];

const invalid = [
  // ── transition: all ────────────────────────────────────────────────────
  {
    code: '.btn { transition: all 150ms ease-out; }',
    errors: ['transitionAll', 'rawDuration'],
  },
  {
    code: '.btn { transition: all var(--duration-subtle) var(--ease-subtle); }',
    errors: ['transitionAll'],
  },
  {
    code: '.btn { transition: opacity 100ms, all 200ms; }',
    errors: ['transitionAll', 'rawDuration'],
  },
  {
    code: '.card { transition-property: all; }',
    errors: ['transitionAll'],
  },
  // ── will-change: all ───────────────────────────────────────────────────
  {
    code: '.pane { will-change: all; }',
    errors: ['willChangeAll'],
  },
  {
    code: '.pane { will-change: transform, all; }',
    errors: ['willChangeAll'],
  },
  // ── raw ms / s durations ───────────────────────────────────────────────
  {
    code: '.btn { transition: color 300ms ease-out; }',
    errors: ['rawDuration'],
  },
  {
    code: '.btn { transition-duration: 150ms; }',
    errors: ['rawDuration'],
  },
  {
    code: '.btn { animation: fade-in 0.6s ease-out both; }',
    errors: ['rawDuration'],
  },
  {
    code: '.btn { animation-duration: 2s; }',
    errors: ['rawDuration'],
  },
];

describe('lint-motion-css', () => {
  describe('valid cases', () => {
    for (const code of valid) {
      it(`passes: ${code.slice(0, 60)}`, () => {
        expect(run(code)).toEqual([]);
      });
    }
  });

  describe('invalid cases', () => {
    for (const { code, errors } of invalid) {
      it(`flags ${errors.join('+')}: ${code.slice(0, 50)}`, () => {
        const actual = run(code);
        for (const messageId of errors) {
          expect(actual).toContain(messageId);
        }
        expect(actual).toHaveLength(errors.length);
      });
    }
  });

  describe('file scoping', () => {
    it.each(migratedFiles)(
      'keeps %s free of motion debt and exemptions',
      file => {
        const filename = resolve(import.meta.dirname, '..', file);
        expect(
          lintCssSource(readFileSync(filename, 'utf8'), filename, {
            grandfathered: false,
          })
        ).toEqual([]);
        expect(
          run('.a { transition: color 140ms ease-out; }', filename)
        ).toEqual(['rawDuration']);
      }
    );

    it('skips allowlisted paths', () => {
      expect(shouldScanFile('apps/web/styles/design-system.css')).toBe(false);
      expect(shouldScanFile('apps/web/app/exp/x.css')).toBe(false);
      expect(shouldScanFile('apps/web/components/a.stories.css')).toBe(false);
      expect(shouldScanFile('apps/web/components/a.test.css')).toBe(false);
      expect(shouldScanFile('apps/web/components/b/Thing.tsx')).toBe(false);
      expect(shouldScanFile(filename)).toBe(true);
      expect(shouldScanFile('packages/ui/tokens/theme.scss')).toBe(true);
    });

    it('grandfathered files suppress rawDuration but not transitionAll', () => {
      expect(
        lintCssSource(
          '.a { transition: color 140ms ease-out; }',
          grandfatheredFilename
        )
      ).toEqual([]);
      const hits = lintCssSource(
        '.a { transition: all 140ms; }',
        grandfatheredFilename
      ).map(v => v.messageId);
      expect(hits).toEqual(['transitionAll']);
    });

    it('reports line numbers', () => {
      const [violation] = lintCssSource(
        '.a { color: red; }\n\n.b { transition: all 1s; }',
        filename
      );
      expect(violation.line).toBe(3);
    });
  });
});
