import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  HomepageV2BelowHero,
  HomepageV2Route,
  HomepageV2SystemOverview,
} from './HomepageV2Route';

describe('HomepageV2Route', () => {
  it('renders the hero and every below-hero section axe-clean', async () => {
    const { container } = render(<HomepageV2Route />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: HOMEPAGE_V2_COPY.hero.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-v2-hero-primary-cta')
    ).toHaveTextContent(HOMEPAGE_V2_COPY.hero.primaryCtaLabel);
    for (const id of [
      'homepage-v2-power-grid',
      'homepage-v2-social-proof',
      'homepage-v2-pricing',
      'homepage-v2-final-cta',
    ])
      expect(screen.getByTestId(id)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the below-hero sequence on its own', () => {
    render(<HomepageV2BelowHero />);

    expect(screen.queryByTestId('homepage-v2-hero')).not.toBeInTheDocument();
    expect(screen.getByTestId('homepage-v2-final-cta')).toBeInTheDocument();
  });

  it('renders the system overview section axe-clean', async () => {
    const { container } = render(<HomepageV2SystemOverview />);

    expect(screen.getAllByRole('heading').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageV2Route />
      </div>
    );

    expect(screen.getByTestId('homepage-v2-hero')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
