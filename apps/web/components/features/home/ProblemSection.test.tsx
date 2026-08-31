import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProblemSection } from './ProblemSection';

describe('ProblemSection', () => {
  it('renders the growth headline', () => {
    render(<ProblemSection />);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Built for growth with discipline/i,
      })
    ).toBeInTheDocument();
  });
});
