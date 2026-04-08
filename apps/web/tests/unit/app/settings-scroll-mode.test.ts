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

const SETTINGS_LAYOUT = resolve(
  __dirname,
  '../../../app/app/(shell)/settings/layout.tsx'
);

describe('settings layout scroll mode', () => {
  it('uses page-level scrolling, not panel scrolling', () => {
    expect(existsSync(SETTINGS_LAYOUT)).toBe(true);
    const source = readFileSync(SETTINGS_LAYOUT, 'utf-8');
    expect(source).toContain("scroll='page'");
    expect(source).not.toContain("scroll='panel'");
  });
});
