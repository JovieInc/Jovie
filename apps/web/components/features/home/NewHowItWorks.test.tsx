import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewHowItWorks } from './NewHowItWorks';

describe('NewHowItWorks', () => {
  it('renders bounded section copy and the three setup steps', () => {
    render(<NewHowItWorks />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'How it works' })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Claim your handle' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Add your links' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Turn clicks into fans' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Jovie.s AI does the heavy lifting/)
    ).toBeInTheDocument();
  });
});
