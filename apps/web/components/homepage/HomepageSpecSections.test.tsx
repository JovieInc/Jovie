import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { DEFAULT_HOME_SPEC } from '@/lib/content-records/marketing-page';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageSpecSections } from './HomepageSpecSections';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

describe('HomepageSpecSections', () => {
  function slottedSpec() {
    const spec = structuredClone(DEFAULT_HOME_SPEC);
    const [hero, split, gallery, cta] = spec.sections;
    if (
      hero?.section !== 'hero' ||
      split?.section !== 'feature-split' ||
      gallery?.section !== 'product-gallery' ||
      cta?.section !== 'cta'
    ) {
      throw new Error('default order changed');
    }
    hero.copy.subhead = 'Spec subhead.';
    hero.copy.primaryAction = 'Ask In';
    split.copy.headline = 'Spec profile headline.';
    gallery.copy.headline = 'Spec gallery headline.';
    cta.copy.headline = 'Spec close headline.';
    return spec;
  }

  it('fills copy slots from the spec and keeps the locked headline and claim action', () => {
    const spec = slottedSpec();
    render(<HomepageSpecSections sections={spec.sections} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Move your music forward.',
      })
    ).toBeTruthy();
    expect(screen.getByText('Spec subhead.')).toBeTruthy();
    expect(screen.getByText('Spec profile headline.')).toBeTruthy();
    expect(screen.getByText('Spec gallery headline.')).toBeTruthy();
    // The claim actions come from the shared CTA intent, not the record.
    const claim = getClaimProfileIntent();
    expect(screen.queryByRole('link', { name: 'Ask In' })).toBeNull();
    expect(
      screen.getAllByRole('link', { name: claim.label }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Spec close headline.')).toBeNull();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: HOMEPAGE_EDITORIAL_COPY.claim.headline,
      })
    ).toBeTruthy();
  });

  it('fills the invitation slots while public signup is closed', () => {
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
    try {
      const spec = slottedSpec();
      render(<HomepageSpecSections sections={spec.sections} />);
      expect(screen.getByRole('link', { name: 'Ask In' })).toBeTruthy();
      expect(screen.getByText('Spec close headline.')).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders sections in spec order', async () => {
    const spec = structuredClone(DEFAULT_HOME_SPEC);
    const { container } = render(
      <HomepageSpecSections sections={[spec.sections[0]!, spec.sections[3]!]} />
    );
    const headings = [...container.querySelectorAll('h1, h2')].map(
      node => node.tagName
    );
    expect(headings).toEqual(['H1', 'H2']);
    expect(container.querySelector('#request-invite')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('renders the full code-default spec with no axe violations', async () => {
    const { container } = render(
      <HomepageSpecSections sections={DEFAULT_HOME_SPEC.sections} />
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
