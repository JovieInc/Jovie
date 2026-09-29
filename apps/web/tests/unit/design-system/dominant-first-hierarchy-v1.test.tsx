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

const MIN_DOMINANCE_RATIO = 1.8;

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function tokenPx(name: string): number {
  const match = new RegExp(`--${name}:\\s*([\\d.]+)px;`).exec(
    read('styles/linear-tokens.css')
  );
  if (!match) throw new Error(`token not found: --${name}`);
  return Number.parseFloat(match[1]);
}

function leadPx(): number {
  const source = read('app/globals.css');
  const block = source.slice(
    source.indexOf('.marketing-lead-linear {'),
    source.indexOf('}', source.indexOf('.marketing-lead-linear {'))
  );
  const match = /font-size:\s*([\d.]+)px;/.exec(block);
  if (!match) throw new Error('marketing-lead-linear font-size not in px');
  return Number.parseFloat(match[1]);
}

// Identity + link-claim hero (Tim 2026-09-28) composes the shared marketing
// type scale: H1 = .marketing-h1-linear, support = .marketing-lead-linear.
describe('JOV-INV-038 dominant-first-hierarchy evaluator (homepage hero)', () => {
  it('renders exactly one dominant heading and a structurally secondary support line', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const headings = within(hero).getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveClass('marketing-h1-linear');

    const support = hero.querySelector('.marketing-lead-linear');
    expect(support).not.toBeNull();
    // Support copy must not itself be a heading — it recedes structurally.
    expect(support?.tagName.toLowerCase()).not.toMatch(/^h[1-6]$/);
  });

  it('sizes the headline substantially larger than the support line at every viewport', () => {
    const support = leadPx();
    for (const token of ['linear-h1-size-sm', 'linear-h1-size']) {
      expect(tokenPx(token) / support).toBeGreaterThanOrEqual(
        MIN_DOMINANCE_RATIO
      );
    }
  });

  it('keeps the headline at full ink while the support line recedes via a lighter ink token', () => {
    render(<HomepageIdentityHero />);
    const hero = screen.getByTestId('marketing-section-hero');
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveClass(
      'text-primary-token'
    );
    const support = hero.querySelector('.marketing-lead-linear');
    expect(support).toHaveClass('text-secondary-token');
    expect(support).not.toHaveClass('text-primary-token');
  });
});
