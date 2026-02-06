import * as Sentry from '@sentry/nextjs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import { isSentryInitialized } from '@/lib/sentry/init';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/sentry/init', () => ({
  isSentryInitialized: vi.fn(),
}));

describe('ErrorBoundary', () => {
  const mockPush = vi.fn();
  const mockReset = vi.fn();
  const mockError = new Error('Test error message');

  // Silence console.error during tests
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
    // Mock console.error to avoid noise in test output
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('rendering', () => {
    it('renders error UI with default message', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText(/We encountered an error loading this page/)
      ).toBeInTheDocument();
    });

    it('renders custom error message when provided', () => {
      const customMessage = 'Custom error message for testing';

      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
          message={customMessage}
        />
      );

      expect(screen.getByText(customMessage)).toBeInTheDocument();
    });

    it('displays Try again and Go home buttons', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /go home/i })
      ).toBeInTheDocument();
    });

    it('renders AlertTriangle icon with aria-hidden', () => {
      const { container } = render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const icon = container.querySelector('svg[aria-hidden="true"]');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has proper ARIA role and live region', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const alertElement = screen.getByRole('alert');
      expect(alertElement).toBeInTheDocument();
      expect(alertElement).toHaveAttribute('aria-live', 'polite');
    });

    it('makes icon decorative with aria-hidden', () => {
      const { container } = render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const icon = container.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('buttons are keyboard accessible', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      const goHomeButton = screen.getByRole('button', { name: /go home/i });

      expect(tryAgainButton).toHaveAttribute('type', 'button');
      expect(goHomeButton).toHaveAttribute('type', 'button');
    });
  });

  describe('error handling', () => {
    it('logs error to console with context', () => {
      const context = 'Dashboard';

      render(
        <ErrorBoundary error={mockError} reset={mockReset} context={context} />
      );

      expect(console.error).toHaveBeenCalledWith(
        `[${context} Error]`,
        mockError
      );
    });

    it('reports error to Sentry when initialized', async () => {
      (isSentryInitialized as ReturnType<typeof vi.fn>).mockReturnValue(true);

      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          mockError,
          expect.objectContaining({
            tags: { errorBoundary: 'test context' },
            extra: { digest: undefined },
          })
        );
      });
    });

    it('does not report to Sentry when not initialized', () => {
      (isSentryInitialized as ReturnType<typeof vi.fn>).mockReturnValue(false);

      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('includes error digest in Sentry report when available', async () => {
      (isSentryInitialized as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const errorWithDigest = Object.assign(new Error('Test error'), {
        digest: 'abc123',
      });

      render(
        <ErrorBoundary
          error={errorWithDigest}
          reset={mockReset}
          context='Test Context'
        />
      );

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          errorWithDigest,
          expect.objectContaining({
            extra: { digest: 'abc123' },
          })
        );
      });
    });

    it('converts context to lowercase for Sentry tag', async () => {
      (isSentryInitialized as ReturnType<typeof vi.fn>).mockReturnValue(true);

      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='MyComponent'
        />
      );

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          mockError,
          expect.objectContaining({
            tags: { errorBoundary: 'mycomponent' },
          })
        );
      });
    });
  });

  describe('user interactions', () => {
    it('calls reset function when Try again button is clicked', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(tryAgainButton);

      expect(mockReset).toHaveBeenCalledTimes(1);
    });

    it('navigates to home when Go home button is clicked', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const goHomeButton = screen.getByRole('button', { name: /go home/i });
      fireEvent.click(goHomeButton);

      expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('supports keyboard navigation for buttons', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      const goHomeButton = screen.getByRole('button', { name: /go home/i });

      // Simulate Enter key press
      fireEvent.keyDown(tryAgainButton, { key: 'Enter' });
      fireEvent.click(tryAgainButton);
      expect(mockReset).toHaveBeenCalled();

      fireEvent.keyDown(goHomeButton, { key: 'Enter' });
      fireEvent.click(goHomeButton);
      expect(mockPush).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles errors without digest', () => {
      const simpleError = new Error('Simple error');

      render(
        <ErrorBoundary
          error={simpleError}
          reset={mockReset}
          context='Test Context'
        />
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('handles empty context string', () => {
      render(<ErrorBoundary error={mockError} reset={mockReset} context='' />);

      expect(console.error).toHaveBeenCalledWith('[ Error]', mockError);
    });

    it('handles very long error messages gracefully', () => {
      const longMessage = 'A'.repeat(500);

      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
          message={longMessage}
        />
      );

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('re-runs effect when error changes', async () => {
      (isSentryInitialized as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const { rerender } = render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const newError = new Error('New error');
      rerender(
        <ErrorBoundary
          error={newError}
          reset={mockReset}
          context='Test Context'
        />
      );

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledTimes(2);
        expect(Sentry.captureException).toHaveBeenLastCalledWith(
          newError,
          expect.any(Object)
        );
      });
    });

    it('re-runs effect when context changes', async () => {
      (isSentryInitialized as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const { rerender } = render(
        <ErrorBoundary error={mockError} reset={mockReset} context='Context1' />
      );

      rerender(
        <ErrorBoundary error={mockError} reset={mockReset} context='Context2' />
      );

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('styling', () => {
    it('applies correct container classes', () => {
      const { container } = render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const outerDiv = container.firstChild as HTMLElement;
      expect(outerDiv).toHaveClass(
        'flex',
        'flex-col',
        'items-center',
        'justify-center'
      );
    });

    it('applies correct button classes', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      const goHomeButton = screen.getByRole('button', { name: /go home/i });

      expect(tryAgainButton).toHaveClass(
        'btn',
        'btn-md',
        'btn-primary',
        'btn-press'
      );
      expect(goHomeButton).toHaveClass(
        'btn',
        'btn-md',
        'btn-secondary',
        'btn-press'
      );
    });
  });
});
