import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiPage from './page';

describe('AiPage', () => {
  it('renders the clamped hero headline with descender-safe leading', () => {
    render(<AiPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'The AI operating system behind every Jovie profile',
      })
    ).toHaveClass('line-clamp-2', 'leading-tight');
  });
});
