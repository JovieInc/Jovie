import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compositeColor,
  contrastRatio,
  parseColor,
  resolveValue,
} from '@/lib/a11y-gates/contrast-engine';
import { loadGateTables } from '@/lib/a11y-gates/contrast-matrix';
import {
  ACCOUNT_LOADING_FILL,
  ACCOUNT_LOADING_FILL_ALPHA,
  ACCOUNT_LOADING_FILL_TOKEN,
} from './account-loading-fill';

const WEB_ROOT = path.resolve(__dirname, '../../..');

/** WCAG 2.1 SC 1.4.11 non-text contrast floor. */
const NON_TEXT_MIN_RATIO = 3;

/**
 * Every surface the account button's loading placeholders render on:
 * the sidebar row, the header (page surface) and the open menu.
 */
const SURFACES = [
  '--app-shell-sidebar-background',
  '--color-bg-surface-0',
  '--color-bg-elevated',
] as const;

/** The fills JOV-12383 replaced. Kept here to prove the bug, not to use. */
const LEGACY_LIGHT_FILL = '--color-bg-surface-2';

function ratioOnSurface(
  table: Map<string, string>,
  fillToken: string,
  alpha: number,
  surfaceToken: string
): number {
  const resolve = (token: string) => {
    const raw = table.get(token);
    const value = raw === undefined ? null : resolveValue(raw, table);
    const color = value === null ? null : parseColor(value);
    if (!color) throw new Error(`Unresolvable token ${token}`);
    return color;
  };
  const surface = resolve(surfaceToken);
  const fill = compositeColor({ ...resolve(fillToken), alpha }, surface);
  return contrastRatio(fill.luminance, surface.luminance);
}

describe('account button loading fill contrast (JOV-12383)', () => {
  it('names the token and alpha the class is built from', () => {
    expect(ACCOUNT_LOADING_FILL).toBe('bg-tertiary-token/75');
    expect(ACCOUNT_LOADING_FILL_TOKEN).toBe('--color-text-tertiary-token');
    expect(ACCOUNT_LOADING_FILL_ALPHA).toBe(0.75);
  });

  it('clears 3:1 on every account surface in light and dark', async () => {
    const tables = await loadGateTables(WEB_ROOT);
    const themes = Object.keys(tables);
    expect(themes).toEqual(expect.arrayContaining(['light', 'dark']));
    for (const theme of themes) {
      for (const surface of SURFACES) {
        const ratio = ratioOnSurface(
          tables[theme],
          ACCOUNT_LOADING_FILL_TOKEN,
          ACCOUNT_LOADING_FILL_ALPHA,
          surface
        );
        expect(
          ratio,
          `${theme} ${surface}: ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(NON_TEXT_MIN_RATIO);
      }
    }
  });

  it('documents why the old light-mode fill was invisible', async () => {
    const tables = await loadGateTables(WEB_ROOT);
    for (const surface of SURFACES) {
      expect(
        ratioOnSurface(tables.light, LEGACY_LIGHT_FILL, 1, surface)
      ).toBeLessThan(1.1);
    }
  });
});
