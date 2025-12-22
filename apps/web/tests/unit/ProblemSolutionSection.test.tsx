import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock analytics BEFORE importing the component so the real module isn't loaded
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { ProblemSolutionSection } from '@/components/home/ProblemSolutionSection';
import { track } from '@/lib/analytics';

describe('ProblemSolutionSection', () => {
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

  it('renders CTA button with proper attributes', () => {
    render(<ProblemSolutionSection />);

    const ctaButton = screen.getByRole('link', {
      name: /Request Early Access/i,
    });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveAttribute('href', '/onboarding');
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
});
