import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthActions } from '@/components/molecules/AuthActions';

// Mock the hook — default: unauthenticated
vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: vi.fn(() => false),
}));

const { useIsAuthenticated } = await import('@/hooks/useIsAuthenticated');
const mockUseIsAuthenticated = vi.mocked(useIsAuthenticated);

describe('AuthActions', () => {
  it('renders log in and sign up links when unauthenticated', () => {
    mockUseIsAuthenticated.mockReturnValue(false);
    render(<AuthActions />);

    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /open app/i })
    ).not.toBeInTheDocument();
  });

  it('renders Open App link when authenticated', () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    render(<AuthActions />);

    const openAppLink = screen.getByRole('link', { name: /open app/i });
    expect(openAppLink).toBeInTheDocument();
    expect(openAppLink).toHaveAttribute('href', '/app');
    expect(
      screen.queryByRole('link', { name: /log in/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign up/i })
    ).not.toBeInTheDocument();
  });

  it('wraps links in a flex container', () => {
    mockUseIsAuthenticated.mockReturnValue(false);
    render(<AuthActions />);

    const logInLink = screen.getByRole('link', { name: /log in/i });
    const container = logInLink.closest('div');
    expect(container).toHaveClass('flex', 'items-center', 'gap-1');
  });
});
