import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * (marketing)/not-found System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped about/support/download guards
 * for the route source, and the download guard's CSS check for the
 * system-b-marketing-not-found block in styles/design-system.css: the 404
 * numeral and viewport sizing live in tokenized CSS, not arbitrary Tailwind
 * values in the route.
 */

const routeSource = 'app/(marketing)/not-found.tsx' as const;
const designSystemPath = 'styles/design-system.css' as const;

const forbiddenRouteVisualPatterns = [
  /style=\{/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|blue|green|purple|pink|yellow|teal|lime|slate|gray|zinc|neutral|stone|black|white)-(?:[0-9]|\[|\/)/,
  /\b(?:bg|border|text|ring|shadow|decoration|from|via|to)-(?:white|black)(?:\/|\b)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/,
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

const forbiddenCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractMarketingNotFoundCss(source: string): string {
  const start = source.indexOf('SYSTEM B MARKETING NOT-FOUND PRIMITIVES');
  const end = source.indexOf('SYSTEM B ERROR FALLBACK PRIMITIVES', start);

  expect(start, 'marketing not-found CSS block exists').toBeGreaterThanOrEqual(
    0
  );
  expect(
    end,
    'marketing not-found CSS block is bounded before the next section'
  ).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('marketing not-found System B source contract', () => {
  it('keeps the route visuals on named System B primitives', () => {
    const source = readFileSync(resolve(process.cwd(), routeSource), 'utf8');

    for (const pattern of forbiddenRouteVisualPatterns) {
      expect(source, `${routeSource} matched ${pattern}`).not.toMatch(pattern);
    }

    expect(source).toContain('MarketingContainer');
    expect(source).toContain('system-b-marketing-not-found');
    expect(source).toContain('system-b-marketing-not-found-code');
    expect(source).toContain('text-primary-token');
    expect(source).toContain('text-tertiary-token');
    expect(source).toContain('public-action-primary');
  });

  it('keeps the marketing not-found CSS block tokenized', () => {
    const css = extractMarketingNotFoundCss(
      readFileSync(resolve(process.cwd(), designSystemPath), 'utf8')
    );

    for (const pattern of forbiddenCssPatterns) {
      expect(css, `${designSystemPath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }

    expect(css).toContain(':where(.system-b-marketing-not-found)');
    expect(css).toContain(':where(.system-b-marketing-not-found-code)');
    expect(css).toContain('var(--color-text-quaternary-token)');
    expect(css).toContain('var(--space-');
  });
});
