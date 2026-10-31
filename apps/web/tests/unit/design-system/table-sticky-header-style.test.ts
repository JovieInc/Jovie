import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UnifiedTable sticky column header occlusion (JOV-9079).
 *
 * WebKit composites `backdrop-filter` on sticky table cells against the wrong
 * backdrop, so a translucent header surface lets scrolled rows bleed through
 * and overlap the column labels (Safari; Chromium shows the intended glass).
 * The sticky column header paints the same fully opaque app-shell content
 * surface the sticky group header uses — `.claude/rules/ui.md`: sticky shell
 * chrome (table headers)
 * renders on `bg-(--app-shell-content-surface)` — and must not rely on
 * backdrop-filter glass.
 */

const css = readFileSync(
  resolve(process.cwd(), 'styles/system-b-app.css'),
  'utf8'
);

/** Every declaration block whose selector mentions the sticky header cell. */
const stickyBlocks =
  css.match(/[^{}]*\.system-b-table-sticky-header[^{}]*\{[^}]*\}/g) ?? [];

const backgrounds = stickyBlocks
  .map(block => block.match(/background:\s*([^;]+);/)?.[1]?.trim() ?? '')
  .filter(Boolean);

describe('UnifiedTable sticky column header occlusion (JOV-9079)', () => {
  it('finds the sticky header rule in system-b-app.css', () => {
    expect(stickyBlocks.length).toBeGreaterThan(0);
  });

  it('paints the sticky column header on a fully opaque content surface', () => {
    expect(backgrounds.length).toBeGreaterThan(0);
    for (const background of backgrounds) {
      expect(background).toBe('var(--system-b-app-content-surface)');
    }
  });

  it('keeps sticky table header cells off backdrop-filter glass', () => {
    for (const block of stickyBlocks) {
      // Covers both `backdrop-filter:` and the `-webkit-backdrop-filter:`
      // alias (the prefixed form matches the same substring).
      expect(block).not.toMatch(/backdrop-filter\s*:/);
    }
  });
});
