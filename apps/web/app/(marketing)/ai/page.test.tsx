import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiPage from './page';

describe('AiPage', () => {
  it('renders the full hero headline under the editorial-title contract', () => {
    render(<AiPage />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'The AI operating system behind every Jovie profile',
    });
    // The two-line clamp truncated the headline at phone widths (JOV-8164);
    // the editorial-title contract keeps the full value proposition visible.
    expect(heading).toHaveAttribute('data-wrap', 'editorial-title');
    expect(heading).not.toHaveClass('line-clamp-2');
  });
});
