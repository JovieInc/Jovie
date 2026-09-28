import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricingPreview } from './PricingPreview';

describe('PricingPreview', () => {
  it('renders bounded pricing copy and the base tiers', () => {
    render(<PricingPreview />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Simple, transparent pricing',
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByText(/Artist profiles are free forever\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Free' })).toHaveClass(
      'uppercase'
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Pro' })).toHaveClass(
      'uppercase'
    );
    expect(
      screen.getByText('Public artist profile and audience capture')
    ).toBeInTheDocument();
    expect(screen.getByText('Limited access.')).toBeInTheDocument();
    expect(screen.getByText('$199')).toBeInTheDocument();
  });
});
