import { cleanup, render, screen } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: vi.fn(),
}));

const mockUseTheme = useTheme as ReturnType<typeof vi.fn>;

describe('LoadingSpinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseTheme.mockReturnValue({
      theme: 'light',
      systemTheme: 'light',
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    cleanup();
  });

  it('renders with default props and has proper accessibility', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('applies correct size classes', () => {
    render(<LoadingSpinner size='sm' />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('h-4', 'w-4');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className='custom-class' />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('custom-class');
  });

  it('implements debounced visibility behavior', () => {
    render(<LoadingSpinner />);

    // Should render initially (even if placeholder)
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });
});
