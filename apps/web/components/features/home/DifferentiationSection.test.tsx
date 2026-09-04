import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DifferentiationSection } from './DifferentiationSection';

describe('DifferentiationSection', () => {
  it('renders the comparison columns with bounded headline copy', () => {
    render(<DifferentiationSection />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Not another link list' })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('heading', { level: 3, name: 'Traditional link pages' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Jovie' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });
});
