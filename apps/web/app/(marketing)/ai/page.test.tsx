import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiPage from './page';

describe('AiPage', () => {
  it('keeps the complete hero headline within the shared two-line contract', () => {
    render(<AiPage />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'The AI operating system behind every Jovie profile',
    });
    expect(heading).toHaveClass('ai-hero-title', 'marketing-h1-max-two-lines');
    expect(heading).not.toHaveAttribute('data-wrap');
  });
});
