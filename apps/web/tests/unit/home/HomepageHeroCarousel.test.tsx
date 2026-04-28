import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageHeroMockupCarousel } from '@/components/homepage/HomepageHeroCarousel';

function expectActiveShot(testId: string) {
  expect(screen.getByTestId(testId)).toHaveAttribute('data-active', 'true');
}

describe('HomepageHeroMockupCarousel', () => {
  afterEach(() => {
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
});
