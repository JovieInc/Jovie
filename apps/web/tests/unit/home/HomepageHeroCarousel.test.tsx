import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageHeroMockupCarousel } from '@/components/homepage/HomepageHeroCarousel';

const originalMatchMedia = window.matchMedia;

function expectActiveShot(testId: string) {
  expect(screen.getByTestId(testId)).toHaveAttribute('data-active', 'true');
}

describe('HomepageHeroMockupCarousel', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it('shows the configured release app shell by default', () => {
    render(<HomepageHeroMockupCarousel />);

    expectActiveShot('homepage-hero-shot-app-shell-releases');
    expect(screen.getByTestId('homepage-hero-carousel')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Desktop release dashboard with tasks, assets, and launch planning'
    );
  });

  it('disables carousel controls when only one shot is configured', () => {
    render(<HomepageHeroMockupCarousel />);

    expect(screen.getByTestId('homepage-hero-carousel')).toContainElement(
      screen.getByTestId('homepage-hero-shot-app-shell-releases')
    );
    expect(
      screen.getByTestId('homepage-hero-frame-app-shell-releases')
    ).toHaveAttribute('data-screenshot-chrome', 'minimal');
    expect(
      screen.queryByRole('button', { name: 'Go to next slide' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Go to previous slide' })
    ).not.toBeInTheDocument();
  });
});
