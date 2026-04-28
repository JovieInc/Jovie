import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('shows the desktop release dashboard by default and advances on click', () => {
    render(<HomepageHeroMockupCarousel />);

    expectActiveShot('homepage-hero-shot-releases-dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Go to next slide' }));

    expectActiveShot('homepage-hero-shot-audience-crm');
  });

  it('does not keep advancing after a click while the pointer remains over the side', () => {
    vi.useFakeTimers();
    render(<HomepageHeroMockupCarousel />);

    const nextButton = screen.getByRole('button', {
      name: 'Go to next slide',
    });

    fireEvent.mouseEnter(nextButton);
    fireEvent.click(nextButton);
    expectActiveShot('homepage-hero-shot-audience-crm');

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expectActiveShot('homepage-hero-shot-audience-crm');
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
    expectActiveShot('homepage-hero-shot-releases-dashboard');

    fireEvent.mouseEnter(nextButton);
    expectActiveShot('homepage-hero-shot-releases-dashboard');

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expectActiveShot('homepage-hero-shot-audience-crm');

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expectActiveShot('homepage-hero-shot-profile-workspace');

    fireEvent.mouseLeave(nextButton);

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expectActiveShot('homepage-hero-shot-profile-workspace');
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

    expectActiveShot('homepage-hero-shot-releases-dashboard');
  });
});
