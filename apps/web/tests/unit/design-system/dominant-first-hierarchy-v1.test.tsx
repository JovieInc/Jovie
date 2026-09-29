// JOV-INV-038 evaluator receipt: dominant-first-hierarchy (visual-semantic).
//
// "One dominant thing to perceive first. Visual hierarchy should be
// intentionally cinematic: the primary idea dominates; secondary information
// recedes substantially rather than competing at nearly equal weight."
//
// Representative surface: the canonical homepage hero
// (apps/web/components/homepage/HomepageIdentityHero.tsx), the flagship
// marketing surface named in that component's own doc comment. This renders
// the real component tree (not a source-text scan) and reads the shared
// marketing type scale, so a refactor that makes the headline and support
// copy compete at nearly equal weight fails this test, not just a taste
// review.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';

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
// A minimum ratio, not the exact locked value (currently ~2.1x-3.6x): tight
// enough that "nearly equal weight" fails closed, loose enough that routine
// type-scale tuning does not make this brittle.
const MIN_DOMINANCE_RATIO = 1.8;
const MIN_INK_CONTRAST_RATIO = 1.8;

function css(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`selector not found: ${selector}`);
  }
  return balancedBlock(source, source.indexOf('{', start), selector);
}

function balancedBlock(source: string, openingBrace: number, label: string) {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  throw new Error(`unterminated block for ${label}`);
}

function atRuleBlock(
  source: string,
  marker: string,
  requiredSelector: string
): string {
  let offset = 0;
  while (offset < source.length) {
    const start = source.indexOf(marker, offset);
    if (start === -1) break;
    const block = balancedBlock(source, source.indexOf('{', start), marker);
    if (block.includes(`${requiredSelector} {`)) return block;
    offset = start + marker.length;
  }
  throw new Error(`at-rule not found for ${requiredSelector}: ${marker}`);
}

function pxDeclaration(source: string, name: string): number {
  const match = new RegExp(`${name}:\\s*([\\d.]+)px;`).exec(source);
  if (!match) {
    throw new Error(`pixel declaration not found for ${name}`);
  }
  return Number.parseFloat(match[1]);
}

function declaration(source: string, name: string): string {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(source)?.[1]?.trim();
  if (!value) throw new Error(`declaration not found for ${name}`);
  return value;
}

function declarationBlock(
  source: string,
  names: readonly string[],
  direct = false
): string {
  for (const match of source.matchAll(/\{([^{}]*)\}/gs)) {
    if (!names.every(name => match[1].includes(`${name}:`))) continue;
    if (
      direct &&
      names.some(name => declaration(match[1], name).includes('var('))
    ) {
      continue;
    }
    return match[1];
  }
  throw new Error(`declaration block not found for ${names.join(', ')}`);
}

function relativeLuminance(color: string): number {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (hex) {
    const channels = hex.slice(1).map(channel => {
      const srgb = Number.parseInt(channel, 16) / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  const neutralLch = /^lch\(([\d.]+)%\s+0(?:\.0+)?\s+[\d.]+\)$/i.exec(color);
  if (neutralLch) {
    const lightness = Number.parseFloat(neutralLch[1]);
    return lightness > 8 ? ((lightness + 16) / 116) ** 3 : lightness / 903.3;
  }

  throw new Error(`unsupported ink color: ${color}`);
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('JOV-INV-038 dominant-first-hierarchy evaluator (homepage hero)', () => {
  it('renders exactly one dominant heading and a structurally secondary support line', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const headings = within(hero).getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveClass(HEADLINE_SELECTOR.slice(1));

    const support = within(hero).getByText(HOMEPAGE_IDENTITY_COPY.hero.subhead);
    expect(support).toHaveClass(SUPPORT_SELECTOR.slice(1));
    // Support copy must not itself be a heading — it recedes structurally,
    // it does not compete as a second thing to perceive first.
    expect(support?.tagName.toLowerCase()).not.toMatch(/^h[1-6]$/);
  });

  it('sizes the headline substantially larger than the support line at every viewport', () => {
    const globalStyles = css('app/globals.css');
    const typeTokens = css('styles/linear-tokens.css');
    const headlineBlock = cssBlock(globalStyles, HEADLINE_SELECTOR);
    const supportBlock = cssBlock(globalStyles, SUPPORT_SELECTOR);

    expect(headlineBlock).toContain('var(--linear-h1-size-sm)');
    const headlineSizes = [
      '--linear-h1-size-sm',
      '--linear-h1-size-md',
      '--linear-h1-size',
    ].map(token => pxDeclaration(typeTokens, token));
    const supportSize = pxDeclaration(supportBlock, 'font-size');

    expect(
      cssBlock(
        atRuleBlock(
          globalStyles,
          '@media (min-width: 768px)',
          HEADLINE_SELECTOR
        ),
        HEADLINE_SELECTOR
      )
    ).toContain('var(--linear-h1-size-md)');
    expect(
      cssBlock(
        atRuleBlock(
          globalStyles,
          '@media (min-width: 1280px)',
          HEADLINE_SELECTOR
        ),
        HEADLINE_SELECTOR
      )
    ).toContain('var(--linear-h1-size)');

    for (const headlineSize of headlineSizes) {
      expect(headlineSize).toBeGreaterThan(supportSize);
      expect(headlineSize / supportSize).toBeGreaterThanOrEqual(
        MIN_DOMINANCE_RATIO
      );
    }
  });

  it('keeps the headline at full ink weight while the support line recedes via a lighter ink token', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const heading = within(hero).getByRole('heading', { level: 1 });
    const support = within(hero).getByText(HOMEPAGE_IDENTITY_COPY.hero.subhead);
    expect(heading).toHaveClass('text-primary-token');
    expect(support).toHaveClass('text-secondary-token');

    const tokenAliases = css('styles/tailwind-foundation.css');
    expect(tokenAliases).toContain(
      '--color-primary-token: var(--color-text-primary-token)'
    );
    expect(tokenAliases).toContain(
      '--color-secondary-token: var(--color-text-secondary-token)'
    );

    const themeTokens = css('styles/design-system.css');
    const lightTheme = declarationBlock(themeTokens, [
      '--noir-ion-canvas',
      '--color-text-primary-token',
      '--color-text-secondary-token',
    ]);
    const darkTheme = declarationBlock(
      themeTokens,
      [
        '--noir-ion-canvas',
        '--noir-ion-text-primary',
        '--noir-ion-text-secondary',
      ],
      true
    );
    const themeInk = [
      {
        background: declaration(lightTheme, '--noir-ion-canvas'),
        primary: declaration(lightTheme, '--color-text-primary-token'),
        secondary: declaration(lightTheme, '--color-text-secondary-token'),
      },
      {
        background: declaration(darkTheme, '--noir-ion-canvas'),
        primary: declaration(darkTheme, '--noir-ion-text-primary'),
        secondary: declaration(darkTheme, '--noir-ion-text-secondary'),
      },
    ];

    for (const { background, primary, secondary } of themeInk) {
      const primaryContrast = contrastRatio(primary, background);
      const secondaryContrast = contrastRatio(secondary, background);
      expect(primaryContrast).toBeGreaterThan(secondaryContrast);
      expect(primaryContrast / secondaryContrast).toBeGreaterThanOrEqual(
        MIN_INK_CONTRAST_RATIO
      );
    }
  });
});
