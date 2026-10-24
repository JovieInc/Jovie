import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkPair,
  defaultCssFiles,
  loadThemeTablesFromFiles,
} from '@/lib/a11y-gates/contrast-engine';

/**
 * WCAG 2.2 AA text ratios match WCAG 2.1: 4.5:1 for body text, 3:1 for
 * large text and UI components. Marketing is the dark Noir Ion theme.
 * Disabled text is not an AA requirement and is not paired here.
 */
const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TOKEN_CSS = 'apps/web/styles/design-system.css';

const TEXT_PAIRS = [
  ['primary', '--noir-ion-text-primary'],
  ['secondary', '--noir-ion-text-secondary'],
  ['muted', '--noir-ion-text-muted'],
  ['tertiary', '--noir-ion-text-tertiary'],
] as const;

const ACCENT_PAIRS = [
  ['ion', '--color-accent-blue'],
  ['ultra', '--color-accent-purple'],
  ['pulse', '--color-accent-pink'],
] as const;

describe('marketing token contrast (WCAG 2.2 AA)', () => {
  const css = readFileSync(join(WEB_ROOT, 'styles/design-system.css'), 'utf8');
  const { dark } = loadThemeTablesFromFiles(defaultCssFiles(WEB_ROOT));

  it('keeps body text at 4.5:1 on the dark canvas and card', () => {
    expect(css).toContain('--noir-ion-text-primary');
    expect(TOKEN_CSS).toBe('apps/web/styles/design-system.css');
    for (const surface of ['--color-bg-page', '--noir-ion-card'] as const) {
      for (const [name, fg] of TEXT_PAIRS) {
        const result = checkPair(
          { name, fg, bg: surface, minRatio: 4.5, themes: ['dark'] },
          dark
        );
        expect(result.status, `${name} on ${surface} ${result.ratio}`).toBe(
          'pass'
        );
      }
    }
  });

  it('keeps Ion, Ultra, and Pulse at 3:1 on the dark canvas', () => {
    for (const [name, fg] of ACCENT_PAIRS) {
      const result = checkPair(
        { name, fg, bg: '--color-bg-page', minRatio: 3, themes: ['dark'] },
        dark
      );
      expect(result.status, `${name} ${result.ratio}`).toBe('pass');
    }
  });
});
