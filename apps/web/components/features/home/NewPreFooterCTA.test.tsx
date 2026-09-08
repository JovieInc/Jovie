import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewPreFooterCTA } from './NewPreFooterCTA';

describe('NewPreFooterCTA', () => {
  it('renders bounded claim copy and front-door CTA links', () => {
    render(<NewPreFooterCTA />);

    expect(screen.getByText('Ready to start')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Ready to claim your @handle/i,
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('link', { name: 'Request Access' })
    ).toHaveAttribute('data-cta-sign-up', 'true');
    expect(
      screen.getByRole('link', { name: 'See how it works' })
    ).toHaveAttribute('href', '#how-it-works');
    expect(screen.getByText('60-second setup')).toBeInTheDocument();
  });
});
