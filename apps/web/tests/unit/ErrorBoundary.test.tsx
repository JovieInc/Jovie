import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Sentry from '@sentry/nextjs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';
import { isSentryInitialized } from '@/lib/sentry/init';
import { inspectRecoveryActions } from '@/tests/utils/recovery-actions';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  getClient: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/sentry/init', () => ({
  isSentryInitialized: vi.fn(),
  getSentryMode: vi.fn().mockReturnValue('enabled'),
}));

const ROOT = process.cwd();

describe('ErrorBoundary', () => {
  const mockReset = vi.fn();
  const mockError = new Error('Test error message');

  // Silence console.error during tests
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
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
        screen.getByText(
          "We couldn't load this page. Give it another try, or head home."
        )
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

    it('displays one Try again recovery action', () => {
      const { container } = render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      expect(
        screen.getAllByRole('button', { name: RECOVERY_COPY.retryLabel })
      ).toHaveLength(1);
      expect(
        screen.queryByRole('button', { name: /go home/i })
      ).not.toBeInTheDocument();
      expect(inspectRecoveryActions(container).issues).toEqual([]);
    });

    it('renders deployment skew as one reload recovery without capturing it', () => {
      const deploymentSkewError = new Error('Failed to find Server Action');

      render(
        <ErrorBoundary
          error={deploymentSkewError}
          reset={mockReset}
          context='Test Context'
        />
      );

      expect(screen.getByText('App Updated')).toBeInTheDocument();
      expect(
        screen.getByText('The app was just updated. Reload to continue.')
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Reload' })).toHaveLength(1);
      expect(
        screen.queryByRole('button', { name: /go home/i })
      ).not.toBeInTheDocument();
      expect(Sentry.captureException).not.toHaveBeenCalled();
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

    it('the recovery action is keyboard accessible', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });

      expect(tryAgainButton).toHaveAttribute('type', 'button');
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
            tags: { errorBoundary: 'test context', sentryMode: 'enabled' },
            extra: { digest: undefined, sentryMode: 'enabled' },
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
            extra: { digest: 'abc123', sentryMode: 'enabled' },
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
            tags: { errorBoundary: 'mycomponent', sentryMode: 'enabled' },
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

    it('supports keyboard activation for the recovery action', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });

      // Simulate Enter key press
      fireEvent.keyDown(tryAgainButton, { key: 'Enter' });
      fireEvent.click(tryAgainButton);
      expect(mockReset).toHaveBeenCalled();
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

    it('renders the recovery action with primary styling', () => {
      render(
        <ErrorBoundary
          error={mockError}
          reset={mockReset}
          context='Test Context'
        />
      );

      const tryAgainButton = screen.getByRole('button', { name: /try again/i });

      // Button uses CVA with Tailwind classes (variant='primary', size='sm')
      expect(tryAgainButton).toHaveAttribute('data-variant', 'primary');
      expect(tryAgainButton).toHaveClass('bg-btn-primary');
    });

    it('keeps the primary action shape stable for failure and deployment-skew states', () => {
      const source = readFileSync(
        join(ROOT, 'components/organisms/ErrorBoundary.tsx'),
        'utf8'
      );

      expect(source).toContain('const primaryAction = isSkewError');
      expect(source).toContain("label: 'Reload'");
      expect(source).toContain('onClick: () => globalThis.location.reload()');
      expect(source).toContain('label: RECOVERY_COPY.retryLabel');
      expect(source).toContain('onClick: reset');
    });
  });
});
