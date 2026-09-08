import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomeBentoPairs } from './HomeBentoPairs';

describe('HomeBentoPairs', () => {
  it('renders bounded bento copy and all paired cards', () => {
    render(<HomeBentoPairs />);

    expect(screen.getByText('What it does')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Turn attention into action.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Smart links that stay current',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Countdowns built in',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Shows land in the right city',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Get paid without losing the moment',
      })
    ).toBeInTheDocument();
  });
});
