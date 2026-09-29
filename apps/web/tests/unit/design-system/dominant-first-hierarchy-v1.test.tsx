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

function css(): string {
  return [
    'app/globals.css',
    'styles/linear-tokens.css',
    'styles/design-system.css',
    'styles/tailwind-foundation.css',
    'components/homepage/HomepageIdentity.css',
  ]
    .map(path => readFileSync(resolve(process.cwd(), path), 'utf8'))
    .join('\n');
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

function hexLightness(hex: string): number {
  const channels = hex.match(/[\da-f]{2}/gi);
  if (!channels || channels.length !== 3)
    throw new Error(`invalid hex: ${hex}`);
  return (
    channels.reduce((sum, value) => sum + Number.parseInt(value, 16), 0) / 3
  );
}

/** Reads the min/max px of a `property: clamp(min, preferred, max);` declaration. */
function clampRangePx(
  block: string,
  property: string
): { min: number; max: number } {
  const clamp = new RegExp(
    `${property}:\\s*clamp\\(([^,]+),[^,]+,([^)]+)\\)`
  ).exec(block);
  if (clamp) return { min: toPx(clamp[1]), max: toPx(clamp[2]) };

  const fixed = new RegExp(`${property}:\\s*([\\d.]+px)`).exec(block)?.[1];
  if (fixed) return { min: toPx(fixed), max: toPx(fixed) };

  const token = new RegExp(`${property}:\\s*var\\((--[^)]+)\\)`).exec(
    block
  )?.[1];
  const stem = token?.replace(/-(?:sm|md)$/, '');
  const values = stem
    ? [
        ...css().matchAll(
          new RegExp(`${stem}(?:-(?:sm|md))?:\\s*([\\d.]+px)`, 'g')
        ),
      ].map(match => toPx(match[1]))
    : [];
  if (values.length === 0) throw new Error(`no type scale found in: ${block}`);
  return { min: Math.min(...values), max: Math.max(...values) };
}

describe('JOV-INV-038 dominant-first-hierarchy evaluator (homepage hero)', () => {
  it('renders exactly one dominant heading and a structurally secondary support line', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const headings = within(hero).getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveClass(
      HEADLINE_SELECTOR.slice(1),
      'text-primary-token'
    );

    const support = hero.querySelector(SUPPORT_SELECTOR);
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
    expect(source).toMatch(
      /@media \(min-width: 768px\)\s*\{\s*\.marketing-h1-linear\s*\{[^}]*font-size:\s*var\(--linear-h1-size-md\);?[^}]*\}\s*\}/
    );
    expect(source).toMatch(
      /@media \(min-width: 1280px\)\s*\{\s*\.marketing-h1-linear\s*\{[^}]*font-size:\s*var\(--linear-h1-size\);?[^}]*\}\s*\}/
    );

    expect(headline.min).toBeGreaterThan(support.min);
    expect(headline.max).toBeGreaterThan(support.max);
    expect(headline.min / support.min).toBeGreaterThanOrEqual(
      MIN_DOMINANCE_RATIO
    );
    expect(headline.max / support.max).toBeGreaterThanOrEqual(
      MIN_DOMINANCE_RATIO
    );
  });

  it('keeps the headline at full ink weight while the support line recedes via a lighter ink token', () => {
    const source = css();
    const darkTheme = cssBlock(source, ':root.dark .system-b-marketing');
    expect(darkTheme).toContain('--color-text-primary-token: #f5f7fb;');
    expect(darkTheme).toContain('--color-text-secondary-token: #a0a5af;');
    const inks = [
      ...darkTheme.matchAll(
        /--color-text-(?:primary|secondary)-token:\s*(#[\da-f]{6})/gi
      ),
    ].map(match => match[1]);
    expect(inks).toHaveLength(2);
    expect(hexLightness(inks[0]) - hexLightness(inks[1])).toBeGreaterThan(60);
    expect(source).toContain(
      '--color-primary-token: var(--color-text-primary-token)'
    );
    expect(source).toContain(
      '--color-secondary-token: var(--color-text-secondary-token)'
    );
    const lightStart = source.indexOf(
      '--color-text-primary-token: lch(9.894% 0 282)'
    );
    const lightTheme = source.slice(
      source.lastIndexOf(':root {', lightStart),
      source.indexOf('}', lightStart)
    );
    expect(lightTheme).toContain(
      '--color-text-primary-token: lch(9.894% 0 282)'
    );
    expect(lightTheme).toContain('--color-text-secondary-token: #5a606a');
    const lightPrimary = Number(
      /--color-text-primary-token:\s*lch\(([\d.]+)%/.exec(lightTheme)?.[1]
    );
    const lightSecondary =
      /--color-text-secondary-token:\s*(#[\da-f]{6})/i.exec(lightTheme)?.[1] ??
      '';
    expect(hexLightness(lightSecondary) - lightPrimary * 2.55).toBeGreaterThan(
      50
    );
  });
});
