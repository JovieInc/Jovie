import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeChapter1 } from './HomeChapter1';

vi.mock('./HomeSandboxCard', () => ({
  HomeSandboxCard: () => (
    <div data-testid='home-sandbox-card'>sandbox card</div>
  ),
}));

describe('HomeChapter1', () => {
  it('renders bounded attention chapter copy and sandbox receipt', () => {
    render(<HomeChapter1 />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Turn attention into action.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('New Song')).toBeInTheDocument();
    expect(screen.getByText('Local Show')).toBeInTheDocument();
    expect(screen.getByTestId('home-sandbox-card')).toBeInTheDocument();
  });
});
