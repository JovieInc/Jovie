import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthActions } from '@/components/molecules/AuthActions';

describe('AuthActions', () => {
  it('always renders log in and sign up links', () => {
    render(<AuthActions />);

    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('wraps links in a flex container', () => {
    render(<AuthActions />);

    const logInLink = screen.getByRole('link', { name: /log in/i });
    const container = logInLink.closest('div');
    expect(container).toHaveClass('flex', 'items-center', 'gap-1');
  });
});
