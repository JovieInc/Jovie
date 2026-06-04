import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock analytics BEFORE importing the component so the real module isn't loaded
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { ProblemSolutionSection } from '@/features/home/ProblemSolutionSection';
import { track } from '@/lib/analytics';

const componentSourcePath = resolve(
  process.cwd(),
  'components/features/home/ProblemSolutionSection.tsx'
);

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
    expect(ctaButton).toHaveAttribute('href', '/start');
  });

  it('tracks analytics when CTA button is clicked', () => {
    render(<ProblemSolutionSection />);

    const ctaButton = screen.getByRole('link', {
      name: /Request Early Access/i,
    });
    ctaButton.addEventListener('click', event => event.preventDefault());
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

  it('keeps System B copy and decorative motion out of the section source', () => {
    const source = readFileSync(componentSourcePath, 'utf8');

    expect(source).not.toContain('Linear-inspired');
    expect(source).not.toContain('animate-pulse');
    expect(source).not.toContain('transition-transform');
    expect(source).not.toContain('group-hover:translate-x');
  });
});
