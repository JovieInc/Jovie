import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeSpecChapter } from './HomeSpecChapter';

vi.mock('./HomeProfileShowcase', () => ({
  HomeProfileShowcase: ({
    className,
    overlayMode,
    presentation,
    stateId,
  }: Readonly<{
    className?: string;
    overlayMode?: string;
    presentation?: string;
    stateId: string;
  }>) => (
    <div
      className={className}
      data-overlay-mode={overlayMode}
      data-presentation={presentation}
      data-state-id={stateId}
      data-testid='home-spec-showcase'
    />
  ),
}));

describe('HomeSpecChapter', () => {
  it('renders bounded philosophy heading, cards, and showcase receipts', () => {
    render(<HomeSpecChapter />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Built for artists' })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('heading', { level: 3, name: 'Opinionated. By design.' })
    ).toBeInTheDocument();
    expect(screen.getByText(/No customization/)).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getAllByTestId('home-spec-showcase')).toHaveLength(4);
  });
});
