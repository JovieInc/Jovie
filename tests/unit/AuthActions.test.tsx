import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthActions } from '@/components/molecules/AuthActions';

describe('AuthActions', () => {
  afterEach(cleanup);

  it('always renders sign in and sign up links', () => {
    render(<AuthActions />);

    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('wraps links in a flex container', () => {
    render(<AuthActions />);

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    const container = signInLink.closest('div');
    expect(container).toHaveClass('flex', 'items-center', 'space-x-4');
  });
});
