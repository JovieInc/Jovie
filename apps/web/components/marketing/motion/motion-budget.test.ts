import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Marketing motion budgets (JOV-7757). Sizes are measured on comment-free
 * transpiled output, gzip -9: an upper bound on what minification ships, so
 * the budget can't pass locally and fail in a production build.
 */
const MOTION_DIR = join(__dirname);

const BUDGETS_GZIP_BYTES = {
  // The hero zoom is CSS transforms only, zero GL. The WebGL ambient and
  // matte fields were removed (no production consumers, 2026-10-29); any new
  // WebGL background registers in data/marketing/animatedBackgroundBudget.ts.
  'hero-shell-zoom.ts': 1.5 * 1024,
} as const;

function transpiledGzipBytes(file: string): number {
  const source = readFileSync(join(MOTION_DIR, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return gzipSync(outputText, { level: 9 }).byteLength;
}

describe('marketing motion budgets', () => {
  it.each(Object.entries(BUDGETS_GZIP_BYTES))(
    '%s stays within its gzip budget',
    (file, budget) => {
      expect(transpiledGzipBytes(file)).toBeLessThanOrEqual(budget);
    }
  );

  it('keeps the hero entrance its consumers rely on, LCP-safe and motion-aware', () => {
    const css = readFileSync(
      join(MOTION_DIR, '../../../app/globals.css'),
      'utf8'
    );
    const keyframes = css.match(/@keyframes hero-fade-up \{[^@]*?\n\}/)?.[0];

    expect(css).toMatch(/\.hero-stagger > \* \{\s*animation: hero-fade-up /);
    expect(keyframes).toContain('opacity: 0.01');
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.hero-stagger > \* \{\s*animation: none;/
    );
  });

  it('steps every block stagger on the one --stagger-block token', () => {
    const css = readFileSync(
      join(MOTION_DIR, '../../../app/globals.css'),
      'utf8'
    );
    const rawStaggerDelays = [
      ...css.matchAll(
        /\.(?:hero-stagger|chat-stagger|reveal-on-scroll)[^{]*\{[^}]*?(?:animation|transition)-delay:\s*\d+m?s/gu
      ),
    ].map(match => match[0].split('{')[0].trim());

    expect(rawStaggerDelays).toEqual([]);
    expect(css.match(/var\(--stagger-block\)/gu)?.length).toBe(11);
  });
});
