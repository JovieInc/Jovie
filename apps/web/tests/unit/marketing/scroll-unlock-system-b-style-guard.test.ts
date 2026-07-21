import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MarketingScrollUnlock System B contract. Part of the founder-directed
 * System A -> System B marketing migration (DESIGN.md 2026-06-18). The helper
 * is the JS fallback for the CSS `:has(.system-b-marketing)` scroll override
 * in globals.css; it must track the System B wrapper, not the retired
 * `.linear-marketing` System A wrapper, and must keep touching only
 * documentElement (setting overflow on body promotes overflow-x:clip to a
 * scroll container that breaks position:sticky).
 */

const sourcePath = 'components/features/home/MarketingScrollUnlock.tsx';

describe('MarketingScrollUnlock System B contract', () => {
  it('tracks the System B marketing wrapper, not System A', () => {
    const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
    expect(source).toContain('system-b-marketing');
    expect(source).not.toContain('linear-marketing');
  });

  it('keeps the scroll unlock scoped to documentElement only', () => {
    const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
    expect(source).toContain(
      "document.documentElement.style.overflowY = 'auto'"
    );
    expect(source).not.toMatch(/document\.body\.style/);
  });
});
