import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression: settings scroll mode must be 'page', not 'panel'.
 *
 * scroll='panel' applies overflow-hidden at 3 nested levels in
 * AppShellContentPanel with no inner overflow-auto, clipping all
 * settings content beyond the viewport.
 *
 * Found by /qa on 2026-04-07.
 */

const SETTINGS_LAYOUT_CANDIDATES = [
  resolve(process.cwd(), 'app/app/(shell)/settings/layout.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/layout.tsx'),
];

const SETTINGS_LAYOUT = SETTINGS_LAYOUT_CANDIDATES.find(candidate =>
  existsSync(candidate)
);

describe('settings layout scroll mode', () => {
  it('locates the settings layout source file', () => {
    expect(
      SETTINGS_LAYOUT,
      `Could not find settings layout source. Checked: ${SETTINGS_LAYOUT_CANDIDATES.join(', ')}`
    ).toBeDefined();
  });

  it('uses page-level scrolling, not panel scrolling', () => {
    if (!SETTINGS_LAYOUT) {
      throw new Error(
        `Could not find settings layout source. Checked: ${SETTINGS_LAYOUT_CANDIDATES.join(', ')}`
      );
    }
    const source = readFileSync(SETTINGS_LAYOUT, 'utf-8');
    expect(source).toMatch(/scroll=["']page["']/);
    expect(source).not.toMatch(/scroll=["']panel["']/);
  });
});
