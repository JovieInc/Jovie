import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreFooterCTA } from './PreFooterCTA';

describe('PreFooterCTA', () => {
  it('renders bounded final CTA copy and profile creation link', () => {
    render(<PreFooterCTA />);

    expect(screen.getByText('Ready to Start')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Ready to turn fans into streams/i,
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('link', { name: 'Create Your Profile' })
    ).toHaveAttribute('href', '/start');
    expect(screen.getByText('60-second setup')).toBeInTheDocument();
    expect(screen.getByText('10,000+')).toHaveClass('font-semibold');
  });
});
