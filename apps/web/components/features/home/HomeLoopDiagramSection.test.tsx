import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomeLoopDiagramSection } from './HomeLoopDiagramSection';

describe('HomeLoopDiagramSection', () => {
  it('renders bounded loop and flatline comparison receipts', () => {
    render(<HomeLoopDiagramSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Stop Letting Momentum Decay.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('The Jovie Loop')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Momentum recycled')).toBeInTheDocument();
  });
});
