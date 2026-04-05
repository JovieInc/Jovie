import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BentoFeatureGrid } from '@/features/home/BentoFeatureGrid';

describe('BentoFeatureGrid', () => {
  it('renders 5 bento cards with correct headings', () => {
    render(<BentoFeatureGrid />);

    expect(
      screen.getByRole('heading', {
        name: 'A command center for your career.',
      })
    ).toBeInTheDocument();

    expect(screen.getByText('Generate a release plan.')).toBeInTheDocument();
    expect(screen.getByText('Tasks track themselves.')).toBeInTheDocument();
    expect(screen.getByText('Fans know before you do.')).toBeInTheDocument();
    expect(screen.getByText('Never start from zero.')).toBeInTheDocument();
  });

  it('renders section with correct aria attributes', () => {
    render(<BentoFeatureGrid />);

    const section = screen
      .getByRole('heading', {
        name: 'A command center for your career.',
      })
      .closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'bento-heading');
  });

  it('renders the eyebrow label', () => {
    render(<BentoFeatureGrid />);

    expect(screen.getByText('Command Center')).toBeInTheDocument();
  });
});
