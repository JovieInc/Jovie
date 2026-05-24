import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageHeroMockupCarousel } from '@/components/homepage/HomepageHeroCarousel';

const originalMatchMedia = window.matchMedia;

function expectActiveShot(testId: string) {
  expect(screen.getByTestId(testId)).toHaveAttribute('data-active', 'true');
}

describe('HomepageHeroMockupCarousel', () => {
  const firstShotId = 'homepage-hero-shot-profile-presence';
  const secondShotId = 'homepage-hero-shot-release-command';
  const fourthShotId = 'homepage-hero-shot-release-signal';

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it('shows the artist profile proof by default and advances on click', () => {
    render(<HomepageHeroMockupCarousel />);

    expectActiveShot(firstShotId);
    expect(
      screen.getByText(
        /Showing Artist Profile: A profile that looks ready before fans arrive\./
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go to next slide' }));

    expectActiveShot(secondShotId);
  });

  it('jumps to a selected product proof dot', () => {
    render(<HomepageHeroMockupCarousel />);

    fireEvent.click(screen.getByRole('tab', { name: 'Show Audience Signal' }));

    expectActiveShot(fourthShotId);
  });

  it('does not auto-advance on hover', () => {
    vi.useFakeTimers();
    render(<HomepageHeroMockupCarousel />);

    fireEvent.mouseEnter(
      screen.getByRole('button', { name: 'Go to next slide' })
    );
    vi.advanceTimersByTime(2200);

    expectActiveShot(firstShotId);
  });

  it('marks reduced motion without disabling manual controls', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<HomepageHeroMockupCarousel />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to next slide' }));

    expectActiveShot(secondShotId);
    expect(screen.getByTestId('homepage-hero-carousel')).toHaveAttribute(
      'data-reduced-motion',
      'true'
    );
  });
});
