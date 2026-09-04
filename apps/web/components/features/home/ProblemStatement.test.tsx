import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProblemStatement } from './ProblemStatement';

describe('ProblemStatement', () => {
  it('renders bounded problem copy and the three proof stats', () => {
    render(<ProblemStatement />);

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Musicians lose fans to bad profile experiences',
    });
    const abandonmentCopy = screen.getByText(
      /73% of fans abandon music discovery when they hit slow/
    );

    expect(screen.getByText('The Problem')).toBeInTheDocument();
    expect(heading).toHaveClass('line-clamp-2');
    expect(abandonmentCopy).toBeInTheDocument();

    for (const stat of ['73%', '2.3s', '3.2x']) {
      expect(screen.getByText(stat)).toBeInTheDocument();
    }

    expect(screen.getByText('Abandon rate on slow pages')).toBeInTheDocument();
    expect(
      screen.getByText('Average load time on competitors')
    ).toBeInTheDocument();
    expect(screen.getByText('Faster than Linktree')).toBeInTheDocument();
  });
});
