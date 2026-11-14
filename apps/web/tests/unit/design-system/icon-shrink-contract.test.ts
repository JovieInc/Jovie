import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DESIGN_SYSTEM_CSS = join(process.cwd(), 'styles', 'design-system.css');

describe('Icon shrink contract', () => {
  it('keeps Lucide glyphs from squashing, in the base layer at zero specificity', () => {
    const css = readFileSync(DESIGN_SYSTEM_CSS, 'utf8').replace(/\s+/g, ' ');
    const matches = [...css.matchAll(/:where\(svg\.lucide\)\s*\{[^}]*\}/g)];

    expect(matches).toHaveLength(1);
    expect(matches[0][0]).toMatch(/flex-shrink:\s*0;/);

    // Base layer sits under utilities, so an explicit shrink class still wins.
    const ruleStart = matches[0].index ?? -1;
    expect(css.lastIndexOf('@layer base', ruleStart)).toBeGreaterThan(
      css.lastIndexOf('}', ruleStart)
    );
  });
});
