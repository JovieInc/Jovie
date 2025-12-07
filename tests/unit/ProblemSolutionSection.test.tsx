import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock analytics BEFORE importing the component so the real module isn't loaded
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { ProblemSolutionSection } from '@/components/home/ProblemSolutionSection';
import { track } from '@/lib/analytics';

describe('ProblemSolutionSection', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders unified section with problem and solution content', () => {
    render(<ProblemSolutionSection />);

    // Check unified badge
    expect(screen.getByText('The Problem & Our Solution')).toBeInTheDocument();

    // Check unified heading
    expect(
      screen.getByText('Your bio link is a speed bump.')
    ).toBeInTheDocument();
    expect(screen.getByText('We built the off-ramp.')).toBeInTheDocument();

    // Check problem description
    expect(
      screen.getByText(/Every extra tap taxes attention/)
    ).toBeInTheDocument();

    // Check solution description
    expect(
      screen.getByText(/Jovie ships a locked, elite artist page/)
    ).toBeInTheDocument();
  });

  it('renders Linear-inspired CTA button with proper styling', () => {
    render(<ProblemSolutionSection />);

    const ctaButton = screen.getByRole('link', {
      name: /Request Early Access/i,
    });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveAttribute('href', '/onboarding');

    // Check for Linear-inspired styling classes
    expect(ctaButton).toHaveClass(
      'inline-flex',
      'items-center',
      'justify-center'
    );
    expect(ctaButton).toHaveClass('focus-visible:outline-hidden');
    expect(ctaButton).toHaveClass('focus-visible:ring-2');
    expect(ctaButton).toHaveClass('transition-all', 'duration-200');

    // Check for proper sizing
    expect(ctaButton).toHaveClass('px-8', 'py-4', 'text-base');
  });

  it('tracks analytics when CTA button is clicked', () => {
    render(<ProblemSolutionSection />);

    const ctaButton = screen.getByRole('link', {
      name: /Request Early Access/i,
    });
    fireEvent.click(ctaButton);

    expect(track).toHaveBeenCalledWith('claim_handle_click', {
      section: 'problem-solution',
    });
  });

  it('has proper accessibility attributes', () => {
    render(<ProblemSolutionSection />);

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('id', 'problem');
    expect(section).toHaveAttribute(
      'aria-labelledby',
      'problem-solution-heading'
    );

    const heading = screen.getByRole('heading', {
      name: /Your bio link is a speed bump/,
    });
    expect(heading).toHaveAttribute('id', 'problem-solution-heading');
  });

  it('includes animated indicator in badge', () => {
    render(<ProblemSolutionSection />);

    // Check for animated pulse indicator
    const pulseIndicator = document.querySelector('.animate-pulse');
    expect(pulseIndicator).toBeInTheDocument();
    expect(pulseIndicator).toHaveClass('bg-amber-400', 'dark:bg-amber-500');
  });

  it('includes arrow icon in CTA button with hover animation', () => {
    render(<ProblemSolutionSection />);

    const ctaButton = screen.getByRole('link', {
      name: /Request Early Access/i,
    });
    const arrowIcon = ctaButton.querySelector('svg');

    expect(arrowIcon).toBeInTheDocument();
    expect(arrowIcon).toHaveClass('group-hover:translate-x-1');
    expect(arrowIcon).toHaveClass('transition-transform', 'duration-200');
  });
});
