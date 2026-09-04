import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IGComparisonAside } from './IGComparisonAside';

describe('IGComparisonAside', () => {
  it('renders bounded comparison copy and deeplink options', () => {
    render(<IGComparisonAside />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Stop sending fans through a maze.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('Linktree in your bio')).toBeInTheDocument();
    expect(screen.getByText('Jovie deeplinks in your bio')).toBeInTheDocument();
    expect(screen.getByText('New Music')).toBeInTheDocument();
    expect(screen.getByText('Zero friction')).toBeInTheDocument();
  });
});
