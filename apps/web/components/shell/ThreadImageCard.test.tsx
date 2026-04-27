import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThreadImageCard } from './ThreadImageCard';

describe('ThreadImageCard', () => {
  it('shows the prompt while generating', () => {
    render(<ThreadImageCard prompt='cosmic radiation' status='generating' />);
    // Prompt appears in both the placeholder copy and the toolbar caption
    // while generating; both should mention the prompt.
    expect(screen.getAllByText(/cosmic radiation/).length).toBeGreaterThan(0);
  });

  it('hides the toolbar while generating', () => {
    render(<ThreadImageCard prompt='p' status='generating' />);
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('shows the toolbar when ready', () => {
    render(<ThreadImageCard prompt='p' status='ready' />);
    expect(
      screen.getByRole('button', { name: 'Download' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Regenerate' })
    ).toBeInTheDocument();
  });
});
