import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/postcss';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const GLOBALS_CSS = readFileSync(join(WEB_ROOT, 'app', 'globals.css'), 'utf8');

const VIEWPORT_UTILITIES = {
  'w-overlay-viewport': 'width: calc(100vw - var(--space-8));',
  'max-h-overlay-viewport': 'max-height: calc(100dvh - var(--space-8));',
  'max-w-sheet-viewport': 'max-width: calc(100vw - var(--space-4));',
  'max-h-sheet-viewport': 'max-height: calc(100dvh - var(--space-4));',
  'scale-press': 'scale: var(--scale-press);',
  'bg-icon-button-frosted':
    'background-color: color-mix(in srgb, var(--color-surface-1) 84%, transparent);',
  'bg-icon-button-frosted-hover':
    'background-color: color-mix(in srgb, var(--color-surface-2) 88%, transparent);',
  'bg-icon-button-pearl-quiet-hover':
    'background-color: color-mix(in srgb, var(--profile-pearl-bg) 88%, transparent);',
  'bg-icon-button-pearl-quiet-focus':
    'background-color: color-mix(in srgb, var(--profile-pearl-bg) 92%, transparent);',
} as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCss(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),:;{}])\s*/g, '$1')
    .trim();
}

function readUtilityBlock(className: string): string {
  const match = GLOBALS_CSS.match(
    new RegExp(`@utility ${escapeRegExp(className)}\\s*\\{[\\s\\S]*?\\n\\}`)
  );

  if (!match) {
    throw new Error(
      `apps/web/app/globals.css is missing @utility ${className}`
    );
  }

  return match[0];
}

describe('shared overlay viewport Tailwind emission', () => {
  it('registers shared visual role utilities in the loaded CSS bridge', () => {
    for (const [className, declaration] of Object.entries(VIEWPORT_UTILITIES)) {
      expect(normalizeCss(readUtilityBlock(className))).toContain(
        normalizeCss(declaration)
      );
    }
  });

  it('emits shared visual role utilities through Tailwind v4', async () => {
    const classNames = Object.keys(VIEWPORT_UTILITIES);
    const compiledCss = (
      await postcss([
        tailwindcss({
          base: join(WEB_ROOT, 'tests', 'unit', 'marketing', 'fixtures'),
        }),
      ]).process(
        `${classNames.map(readUtilityBlock).join('\n')}\n` +
          `@source inline("${classNames.join(' ')}");\n` +
          '@tailwind utilities;',
        { from: undefined }
      )
    ).css;
    const normalizedCompiledCss = normalizeCss(compiledCss);

    for (const [className, declaration] of Object.entries(VIEWPORT_UTILITIES)) {
      const selectorIndex = normalizedCompiledCss.indexOf(`.${className}{`);
      expect(selectorIndex).toBeGreaterThanOrEqual(0);
      expect(
        normalizedCompiledCss.indexOf(normalizeCss(declaration), selectorIndex)
      ).toBeGreaterThan(selectorIndex);
      expect(normalizedCompiledCss.indexOf('}', selectorIndex)).toBeGreaterThan(
        normalizedCompiledCss.indexOf(normalizeCss(declaration), selectorIndex)
      );
    }
  });
});
