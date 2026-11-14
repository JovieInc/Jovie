import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepagePosterHero } from './HomepagePosterHero';
import { HomepageTrackedLink } from './HomepageTrackedLink';
import { trackHomepageEvent } from './homepage-analytics';

vi.mock('./homepage-analytics', () => ({ trackHomepageEvent: vi.fn() }));

function renderHero(
  props: Partial<Parameters<typeof HomepagePosterHero>[0]> = {}
) {
  return render(
    <HomepagePosterHero
      headline='Your music. Still moving.'
      subtitle='One focused workspace for every release.'
      primaryCta={{
        label: 'Get started',
        href: '/signup',
        eventName: 'homepage_poster_cta_clicked',
        eventProperties: { placement: 'hero' },
      }}
      media={<p>Product surface</p>}
      seam={<span data-testid='seam-slot' />}
      {...props}
    />
  );
}

describe('HomepagePosterHero certificate', () => {
  beforeEach(() => {
    vi.mocked(trackHomepageEvent).mockClear();
  });

  it('renders the headline, lede and both actions axe-clean', async () => {
    const { container } = renderHero({
      lede: 'Keep your profile and links working together.',
      secondaryCta: { label: 'See artist profiles', href: '/artist-profiles' },
    });

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your music. Still moving.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Keep your profile and links working together.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(
      screen.getByRole('link', { name: 'See artist profiles' })
    ).toHaveAttribute('href', '/artist-profiles');
    expect(screen.getByTestId('homepage-poster-hero-seam')).toContainElement(
      screen.getByTestId('seam-slot')
    );
    await expectNoA11yViolations(container);
  });

  it('omits the lede and secondary action when they are not passed', async () => {
    const { container } = renderHero();

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByTestId('homepage-secondary-cta')).toBeNull();
    expect(container.querySelector('.homepage-poster-hero__lede')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('tracks the primary action through the homepage tracked link', async () => {
    const user = userEvent.setup();
    const { container } = renderHero({
      trackedLinkComponent: HomepageTrackedLink,
    });
    const link = screen.getByRole('link', { name: 'Get started' });
    link.addEventListener('click', event => event.preventDefault());

    await user.click(link);

    expect(trackHomepageEvent).toHaveBeenCalledWith(
      'homepage_poster_cta_clicked',
      { placement: 'hero' }
    );
    await expectNoA11yViolations(container);
  });
});
