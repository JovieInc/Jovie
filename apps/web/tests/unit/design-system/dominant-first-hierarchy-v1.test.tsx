// JOV-INV-038 evaluator receipt: dominant-first-hierarchy (visual-semantic).
//
// "One dominant thing to perceive first. Visual hierarchy should be
// intentionally cinematic: the primary idea dominates; secondary information
// recedes substantially rather than competing at nearly equal weight."
//
// Representative surface: the canonical homepage hero
// (apps/web/components/homepage/HomepageArtistProfile.tsx), the flagship
// marketing surface. This renders
// the real component tree (not a source-text scan) and reads the actual
// declared type-scale and ink tokens from its stylesheet, so a refactor that
// makes the headline and support copy compete at nearly equal weight fails
// this test, not just a taste review.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageArtistHero } from '@/components/homepage/HomepageArtistProfile';
import { contrastRatio } from '@/lib/utils/color';

vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));
vi.mock('@/lib/flags/marketing-static', () => ({
  FEATURE_FLAGS: { WAITLIST_ENABLED: true },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));

const HEADLINE_SELECTOR = '.marketing-type-display';
const SUPPORT_SELECTOR = '.marketing-type-lede';
// A minimum ratio, not the exact locked value (currently ~2.25x-3.2x): tight
// enough that "nearly equal weight" fails closed, loose enough that routine
// type-scale tuning does not make this brittle.
const MIN_DOMINANCE_RATIO = 1.8;
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

function css(): string {
  return read('app/globals.css');
}

/** First declaration of each custom property in the System B token sheet. */
function tokenTable(): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  for (const match of read('styles/design-system.css').matchAll(
    /(--[\w-]+):\s*([^;{}]+);/g
  )) {
    if (!table.has(match[1])) table.set(match[1], match[2].trim());
  }
  return table;
}

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`selector not found in stylesheet: ${selector}`);
  }
  const end = source.indexOf('}', start);
  if (end === -1) {
    throw new Error(`unterminated rule for ${selector} in stylesheet`);
  }
  return source.slice(start, end);
}

/** Splits top-level commas (not those nested inside var()/calc()). */
function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of args) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** Resolves a token-built length (rem, px, var(), calc(a + b)) to px. */
function toPx(expr: string, tokens: ReadonlyMap<string, string>): number {
  const value = expr.trim();
  const rem = /^([\d.]+)rem$/.exec(value);
  if (rem) return Number.parseFloat(rem[1]) * 16;
  const px = /^([\d.]+)px$/.exec(value);
  if (px) return Number.parseFloat(px[1]);
  const variable = /^var\((--[\w-]+)\)$/.exec(value);
  if (variable) {
    const resolved = tokens.get(variable[1]);
    if (!resolved) throw new Error(`unknown token ${variable[1]}`);
    return toPx(resolved, tokens);
  }
  const calc = /^calc\((.+)\)$/.exec(value);
  if (calc) {
    const [left, right] = calc[1].split(/\s\+\s/);
    if (!right) throw new Error(`unsupported calc(): ${value}`);
    return toPx(left, tokens) + toPx(right, tokens);
  }
  throw new Error(`unsupported length: ${value}`);
}

/** Min/max px of a font-size declared as a length, clamp(), or ramp token. */
function clampRangePx(
  block: string,
  property: string
): { min: number; max: number } {
  const tokens = tokenTable();
  let declared = new RegExp(`${property}:\\s*([^;]+);`).exec(block)?.[1];
  if (!declared) throw new Error(`no ${property} in: ${block}`);
  declared = declared.trim();
  const variable = /^var\((--[\w-]+)\)$/.exec(declared);
  if (variable) declared = tokens.get(variable[1]) ?? declared;
  const clamp = /^clamp\((.+)\)$/.exec(declared.replace(/\s+/g, ' '));
  if (!clamp) {
    const fixed = toPx(declared, tokens);
    return { min: fixed, max: fixed };
  }
  const [min, , max] = splitArgs(clamp[1]);
  return { min: toPx(min, tokens), max: toPx(max, tokens) };
}

describe('JOV-INV-038 dominant-first-hierarchy evaluator (homepage hero)', () => {
  it('renders exactly one dominant heading and a structurally secondary support line', () => {
    render(<HomepageArtistHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const headings = within(hero).getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveClass('marketing-type-display');
    expect(headings[0]).toHaveClass('text-primary-token');

    const support = hero.querySelector('.marketing-type-lede');
    expect(support).not.toBeNull();
    expect(support).toHaveClass('text-secondary-token');
    // Support copy must not itself be a heading — it recedes structurally,
    // it does not compete as a second thing to perceive first.
    expect(support?.tagName.toLowerCase()).not.toMatch(/^h[1-6]$/);
  });

  it('sizes the headline substantially larger than the support line at every viewport', () => {
    const source = css();
    const headline = clampRangePx(
      cssBlock(source, HEADLINE_SELECTOR),
      'font-size'
    );
    const support = clampRangePx(
      cssBlock(source, SUPPORT_SELECTOR),
      'font-size'
    );

    expect(headline.min).toBeGreaterThan(support.min);
    expect(headline.max).toBeGreaterThan(support.max);
    expect(headline.min / support.min).toBeGreaterThanOrEqual(
      MIN_DOMINANCE_RATIO
    );
    expect(headline.max / support.max).toBeGreaterThanOrEqual(
      MIN_DOMINANCE_RATIO
    );

    // Both roles read the one --ds-marketing-* ramp, never page clamps.
    expect(cssBlock(source, HEADLINE_SELECTOR)).toContain(
      'var(--ds-marketing-title-size)'
    );
    expect(cssBlock(source, SUPPORT_SELECTOR)).toContain(
      'var(--ds-marketing-lede-size)'
    );
  });

  it('keeps the headline at full ink weight while the support line recedes via a lighter ink token', () => {
    // The hero paints ink through the semantic token utilities only; the
    // homepage stylesheet must not re-mix or fade either ink.
    const source = read('components/homepage/HomepageArtistProfile.css');
    expect(source).not.toMatch(/--color-text-(?:primary|secondary)-token\s*:/);
    const support = cssBlock(source, '.homepage-artist-hero__subhead');
    expect(support).not.toContain('color-mix');

    const theme = read('styles/design-system.css');
    const tailwind = read('styles/tailwind-foundation.css');
    const dark = cssBlock(theme, ':root.dark .system-b-marketing');
    expect(dark).toContain('--color-text-primary-token: #f5f7fb;');
    expect(dark).toContain('--color-text-secondary-token: #a0a5af;');
    expect(
      contrastRatio('#f5f7fb', '#030406') / contrastRatio('#a0a5af', '#030406')
    ).toBeGreaterThan(1.8);
    expect(tailwind).toContain(
      '--color-primary-token: var(--color-text-primary-token)'
    );
    expect(tailwind).toContain(
      '--color-secondary-token: var(--color-text-secondary-token)'
    );
    expect(theme).toMatch(
      /:root\s*\{[^{}]*--color-text-primary-token:\s*lch\(9\.894% 0 282\)[^{}]*--color-text-secondary-token:\s*#5a606a/
    );
    expect(0x5a - 9.894 * 2.55).toBeGreaterThan(50);
  });
});
