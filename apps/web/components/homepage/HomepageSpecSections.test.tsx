import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HOME_SPEC,
  type MarketingPageSection,
} from '@/lib/content-records/marketing-page';
import { HomepageSpecSections } from './HomepageSpecSections';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

function sectionOf<S extends MarketingPageSection['section']>(
  sections: MarketingPageSection[],
  id: S
): Extract<MarketingPageSection, { section: S }> {
  const entry = sections.find(section => section.section === id);
  if (!entry) throw new Error(`default spec lost ${id}`);
  return entry as Extract<MarketingPageSection, { section: S }>;
}

describe('HomepageSpecSections', () => {
  it('fills copy slots from the spec and keeps the locked headline', () => {
    const spec = structuredClone(DEFAULT_HOME_SPEC);
    const hero = sectionOf(spec.sections, 'hero');
    hero.copy.subhead = 'Spec subhead.';
    hero.copy.claimAction = 'Reserve';
    sectionOf(spec.sections, 'how-it-works').copy.headline = 'Spec loop.';
    sectionOf(spec.sections, 'feature-split').copy.body = 'Spec list body.';
    sectionOf(spec.sections, 'pricing').copy.plansLinkLabel = 'See plans';
    sectionOf(spec.sections, 'cta').copy.headline = 'Spec close headline.';

    render(<HomepageSpecSections sections={spec.sections} />);

    expect(
      screen.getByRole('heading', { level: 1, name: /be found/i })
    ).toBeTruthy();
    expect(screen.getByText('Spec subhead.')).toBeTruthy();
    expect(screen.getByText('Spec loop.')).toBeTruthy();
    expect(screen.getByText('Spec list body.')).toBeTruthy();
    expect(screen.getByText('Spec close headline.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See plans' })).toBeTruthy();
    // The closing claim mirrors the hero claim label.
    expect(screen.getAllByRole('button', { name: 'Reserve' })).toHaveLength(2);
  });

  it('renders the five beats in spec order, each with its own heading', () => {
    const { container } = render(
      <HomepageSpecSections sections={DEFAULT_HOME_SPEC.sections} />
    );
    const headings = [...container.querySelectorAll('h1, h2')].map(
      node => node.id
    );
    expect(headings).toEqual([
      'home-hero-heading',
      'homepage-loop-heading',
      'homepage-ownership-heading',
      'homepage-offer-heading',
      'homepage-close-heading',
    ]);
  });
});
