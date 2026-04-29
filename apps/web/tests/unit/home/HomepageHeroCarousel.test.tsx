import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageHeroMockupCarousel } from '@/components/homepage/HomepageHeroCarousel';

const originalMatchMedia = window.matchMedia;

function expectActiveShot(testId: string) {
  expect(screen.getByTestId(testId)).toHaveAttribute('data-active', 'true');
}

describe('HomepageHeroMockupCarousel', () => {
  const firstShotId = 'homepage-hero-shot-release-calendar-sidebar';
  const secondShotId = 'homepage-hero-shot-audience-crm';
  const thirdShotId = 'homepage-hero-shot-profile-workspace';

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it('shows the desktop release calendar by default and advances on click', () => {
    render(<HomepageHeroMockupCarousel />);

    expectActiveShot(firstShotId);

    fireEvent.click(screen.getByRole('button', { name: 'Go to next slide' }));

    expectActiveShot(secondShotId);
  });

  it('does not keep advancing after a click while the pointer remains over the side', () => {
    vi.useFakeTimers();
    render(<HomepageHeroMockupCarousel />);

    const nextButton = screen.getByRole('button', {
      name: 'Go to next slide',
    });

    fireEvent.mouseEnter(nextButton);
    fireEvent.click(nextButton);
    expectActiveShot(secondShotId);

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expectActiveShot(secondShotId);
  });

  it('advances only while a side hover is active', () => {
    vi.useFakeTimers();
    render(<HomepageHeroMockupCarousel />);

    const nextButton = screen.getByRole('button', {
      name: 'Go to next slide',
    });

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expectActiveShot(firstShotId);

    fireEvent.mouseEnter(nextButton);
    expectActiveShot(firstShotId);

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expectActiveShot(secondShotId);

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expectActiveShot(thirdShotId);

    fireEvent.mouseLeave(nextButton);

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expectActiveShot(thirdShotId);
  });

  it('does not hover-advance when reduced motion is enabled', () => {
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

    vi.useFakeTimers();
    render(<HomepageHeroMockupCarousel />);

    const nextButton = screen.getByRole('button', {
      name: 'Go to next slide',
    });

    fireEvent.mouseEnter(nextButton);

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expectActiveShot(firstShotId);
  });
});
