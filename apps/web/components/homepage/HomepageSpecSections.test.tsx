import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('fills copy slots from the spec and keeps the locked headline', () => {
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

    render(<HomepageSpecSections sections={spec.sections} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Move your music forward.',
      })
    ).toBeTruthy();
    expect(screen.getByText('Spec subhead.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ask In' })).toBeTruthy();
    expect(screen.getByText('Spec profile headline.')).toBeTruthy();
    expect(screen.getByText('Spec gallery headline.')).toBeTruthy();
    expect(screen.getByText('Spec close headline.')).toBeTruthy();
  });

  it('forwards a forced start CTA to the hero and the close', () => {
    const { container, rerender } = render(
      <HomepageSpecSections sections={DEFAULT_HOME_SPEC.sections} startCta />
    );
    expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
      'href',
      '/start'
    );
    expect(screen.getByTestId('homepage-close-cta')).toHaveAttribute(
      'href',
      '/start'
    );
    expect(container.textContent).not.toMatch(/invit/i);

    rerender(
      <HomepageSpecSections
        sections={DEFAULT_HOME_SPEC.sections}
        startCta={false}
      />
    );
    expect(screen.queryByTestId('homepage-close-cta')).toBeNull();
    expect(screen.getByTestId('waitlist-role-form')).toBeTruthy();
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
