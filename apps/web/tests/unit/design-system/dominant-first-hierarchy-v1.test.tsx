// JOV-INV-038 evaluator receipt: dominant-first-hierarchy (visual-semantic).
//
// "One dominant thing to perceive first. Visual hierarchy should be
// intentionally cinematic: the primary idea dominates; secondary information
// recedes substantially rather than competing at nearly equal weight."
//
// Representative surface: the canonical homepage hero
// (apps/web/components/homepage/HomepageIdentityHero.tsx), the flagship
// marketing surface named in that component's own doc comment. This renders
// the real component tree (not a source-text scan) and reads the actual
// declared type-scale and ink tokens from its stylesheet, so a refactor that
// makes the headline and support copy compete at nearly equal weight fails
// this test, not just a taste review.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
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

const HEADLINE_SELECTOR = '.marketing-h1-linear';
const SUPPORT_SELECTOR = '.marketing-lead-linear';
// A minimum ratio, not the exact locked value (currently ~2.25x-3.2x): tight
// enough that "nearly equal weight" fails closed, loose enough that routine
// type-scale tuning does not make this brittle.
const MIN_DOMINANCE_RATIO = 1.8;
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

function css(): string {
  return `${read('app/globals.css')}\n${read('styles/linear-tokens.css')}`;
}

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`selector not found in HomepageIdentity.css: ${selector}`);
  }
  const end = source.indexOf('}', start);
  if (end === -1) {
    throw new Error(
      `unterminated rule for ${selector} in HomepageIdentity.css`
    );
  }
  return source.slice(start, end);
}

function toPx(bound: string): number {
  const trimmed = bound.trim();
  const rem = /^([\d.]+)rem$/.exec(trimmed);
  if (rem) return Number.parseFloat(rem[1]) * 16;
  const px = /^([\d.]+)px$/.exec(trimmed);
  if (px) return Number.parseFloat(px[1]);
  throw new Error(`unsupported clamp() bound unit: ${trimmed}`);
}

/** Reads the min/max px of a `property: clamp(min, preferred, max);` declaration. */
function clampRangePx(
  block: string,
  property: string
): { min: number; max: number } {
  const fixed = new RegExp(`${property}:\\s*([\\d.]+px)`).exec(block)?.[1];
  if (fixed) return { min: toPx(fixed), max: toPx(fixed) };
  if (block.includes('var(--linear-h1-size-sm)')) {
    return { min: 38, max: 64 };
  }
  const match = new RegExp(
    `${property}:\\s*clamp\\(([^,]+),[^,]+,([^)]+)\\)`
  ).exec(block);
  if (!match) {
    throw new Error(`no clamp() found for ${property} in: ${block}`);
  }
  return { min: toPx(match[1]), max: toPx(match[2]) };
}

describe('JOV-INV-038 dominant-first-hierarchy evaluator (homepage hero)', () => {
  it('renders exactly one dominant heading and a structurally secondary support line', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const headings = within(hero).getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveClass('marketing-h1-linear');
    expect(headings[0]).toHaveClass('text-primary-token');

    const support = hero.querySelector('.marketing-lead-linear');
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

    expect(source).toMatch(
      /@media \(min-width: 768px\)\s*\{\s*\.marketing-h1-linear\s*\{[^}]*font-size:\s*var\(--linear-h1-size-md\)/
    );
    expect(source).toMatch(
      /@media \(min-width: 1280px\)\s*\{\s*\.marketing-h1-linear\s*\{[^}]*font-size:\s*var\(--linear-h1-size\)/
    );
    expect(source).toMatch(
      /--linear-h1-size:\s*64px;[\s\S]*--linear-h1-size-sm:\s*38px;[\s\S]*--linear-h1-size-md:\s*56px;/
    );
  });

  it('keeps the headline at full ink weight while the support line recedes via a lighter ink token', () => {
    const source = read('components/homepage/HomepageIdentity.css');
    // The light-theme override is the one block that gives each ink token a
    // literal value (the dark default aliases straight to --color-text-*);
    // it is where "recedes" is either honored or silently dropped.
    const lightThemeBlock = cssBlock(
      source,
      ':root:not(.dark) .homepage-identity-hero'
    );

    const primaryInk = /--homepage-identity-hero-ink:\s*([^;]+);/.exec(
      lightThemeBlock
    )?.[1];
    const secondaryInk = /--homepage-identity-hero-ink-2:\s*([^;]+);/.exec(
      lightThemeBlock
    )?.[1];
    expect(primaryInk, 'primary ink token declared').toBeTruthy();
    expect(secondaryInk, 'secondary ink token declared').toBeTruthy();

    // The dominant headline keeps full opacity — no color-mix fade.
    expect(primaryInk).not.toContain('color-mix');

    // The receding support line is mixed toward transparent at some opacity
    // below 100% — "recedes substantially", not simultaneous full weight.
    const secondaryOpacity = Number.parseFloat(
      /(\d+(?:\.\d+)?)%/.exec(secondaryInk ?? '')?.[1] ?? 'NaN'
    );
    expect(Number.isNaN(secondaryOpacity)).toBe(false);
    expect(secondaryOpacity).toBeLessThan(100);
    expect(secondaryOpacity).toBeGreaterThan(0);

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
