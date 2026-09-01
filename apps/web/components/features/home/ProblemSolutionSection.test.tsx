import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { ProblemSolutionSection } from './ProblemSolutionSection';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('ProblemSolutionSection', () => {
  it('renders bounded problem-solution copy and tracks the CTA', () => {
    render(<ProblemSolutionSection />);

    expect(screen.getByText('The Problem & Our Solution')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Your bio link is a speed bump/,
      })
    ).toHaveClass('line-clamp-2');

    const cta = screen.getByRole('link', { name: /Request Early Access/i });
    expect(cta).toHaveAttribute('href', '/start');
    cta.addEventListener('click', event => event.preventDefault());
    fireEvent.click(cta);

    expect(track).toHaveBeenCalledWith('claim_handle_click', {
      section: 'problem-solution',
    });
  });
});
