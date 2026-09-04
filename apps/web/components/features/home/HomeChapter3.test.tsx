import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeChapter3 } from './HomeChapter3';

vi.mock('./HomeCountdownObject', () => ({
  HomeCountdownObject: () => (
    <div data-testid='home-countdown-object'>countdown</div>
  ),
}));

vi.mock('./HomeLocationAwareObject', () => ({
  HomeLocationAwareObject: () => (
    <div data-testid='home-location-aware-object'>location</div>
  ),
}));

vi.mock('./HomeRelationshipPanel', () => ({
  HomeRelationshipPanel: () => (
    <div data-testid='home-relationship-panel'>relationship</div>
  ),
}));

describe('HomeChapter3', () => {
  it('renders bounded fan relationship chapter receipts', () => {
    render(<HomeChapter3 />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Know who your fans are and when to reach them.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByTestId('home-relationship-panel')).toBeInTheDocument();
    expect(screen.getByTestId('home-countdown-object')).toBeInTheDocument();
    expect(
      screen.getByTestId('home-location-aware-object')
    ).toBeInTheDocument();
  });
});
