import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const rawComponentVisualPatterns = [
  /\b(?:text|rounded|shadow|border|bg|px|py|pt|pb|min-w|min-h|max-w|max-h|w|h|tracking|blur|duration|z)-\[[^\]]+\]/,
  /\bfont-\[[^\]]+\]/,
  /\brgba?\(/,
  /#[0-9A-Fa-f]{3,8}\b/,
  /(?:radial|linear)-gradient/,
  /\bbg-accent\/\d+/,
  /--surface-[0-9]/,
];

describe('UnavailablePage System B style guard', () => {
  it('keeps the unavailable page component on named System B primitives', () => {
    const source = readFileSync(
      path.join(webRoot, 'components/UnavailablePage.tsx'),
      'utf8'
    );
    const offenders = rawComponentVisualPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders, `UnavailablePage leaked ${offenders.join(', ')}`).toEqual(
      []
    );
  });

  it('keeps unavailable page CSS quiet and token-backed', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const unavailableCss = source.match(
      /:where\(\.system-b-unavailable-page\)[\s\S]*?\/\* ============================================\s+SYSTEM B ONBOARDING V2 PRIMITIVES/
    )?.[0];

    expect(unavailableCss).toContain('var(--system-b-bg-page)');
    expect(unavailableCss).toContain('var(--system-b-text-primary)');
    expect(unavailableCss).toContain('var(--color-text-secondary-token)');
    expect(unavailableCss).toContain('var(--space-10)');
    expect(unavailableCss).not.toMatch(/--linear-/);
    expect(unavailableCss).not.toMatch(/--surface-[0-9]/);
    expect(unavailableCss).not.toMatch(/\brgba?\(/);
    expect(unavailableCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(unavailableCss).not.toMatch(/(?:radial|linear)-gradient/);
    expect(unavailableCss).not.toMatch(/\bblur\b/);
  });
});
