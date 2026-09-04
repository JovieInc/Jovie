import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialProofSection } from './ComparisonSection';

describe('ComparisonSection', () => {
  it('renders bounded social proof and conversion metrics', () => {
    render(<SocialProofSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Musicians Love Jovie',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('10,000+')).toBeInTheDocument();
    expect(screen.getByText('+47% streams')).toBeInTheDocument();
  });
});
