'use client';

import * as Sentry from '@sentry/nextjs';
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { toast } from 'sonner';
import { getSentryMode, isSentryInitialized } from '@/lib/sentry/init';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showToast?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary that integrates with the toast notification system
 * Automatically shows user-friendly error toasts for certain types of errors
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /** Check if an error should be shown to the user */
  private isUserFacingError(error: unknown): boolean {
    if (typeof error === 'string') return true;
    if (error instanceof Error) {
      const technicalErrors = [
        'Network request failed',
        'TypeError',
        'ReferenceError',
        'SyntaxError',
      ];
      return !technicalErrors.some(techError =>
        error.message.includes(techError)
      );
    }
    return false;
  }

  /** Extract user-friendly message from error */
  private getUserFriendlyErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return 'Network error. Please check your connection.';
      }
      if (error.message.includes('rate limit')) {
        return 'Too many requests. Please wait a moment.';
      }
      if (error.message.length < 100 && !error.message.includes('at ')) {
        return error.message;
      }
    }
    return 'Something went wrong. Please try again.';
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Capture error in Sentry with component stack context
    // Works with both lite and full SDK variants
    this.captureErrorInSentry(error, errorInfo);

    // Show toast notification if enabled and error is user-facing
    if (this.props.showToast !== false && this.isUserFacingError(error)) {
      // Sonner's toast function works without React context
      toast.error(this.getUserFriendlyErrorMessage(error), {
        duration: 6000,
        action: {
          label: 'Reload',
          onClick: () => window.location.reload(),
        },
      });
    }

    // Track error for monitoring with gtag as backup
    if (typeof window !== 'undefined' && 'gtag' in window) {
      // @ts-expect-error - gtag is not typed
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: false,
      });
    }
  }

  /**
   * Captures an error in Sentry with SDK variant awareness.
   *
   * This method gracefully handles both lite and full SDK modes:
   * - Checks if Sentry is initialized before attempting capture
   * - Includes SDK mode information in tags for debugging
   * - Provides fallback logging if Sentry is not available
   *
   * @param error - The error to capture
   * @param errorInfo - React error info with component stack
   */
  private captureErrorInSentry(error: Error, errorInfo: ErrorInfo): void {
    const sentryMode = getSentryMode();
    const isInitialized = isSentryInitialized();

    // Capture error in Sentry if SDK is initialized (works with both lite and full modes)
    if (isInitialized) {
      try {
        Sentry.captureException(error, {
          extra: {
            componentStack: errorInfo.componentStack,
            sentryMode, // Include SDK mode for debugging
          },
          tags: {
            errorBoundary: 'true',
            sentryMode, // Tag to filter by SDK variant in Sentry dashboard
          },
        });
      } catch (sentryError) {
        // Fallback: Sentry capture failed, log to console
        // This should never happen but provides resilience
        console.error('[ErrorBoundary] Sentry capture failed:', sentryError);
        console.error('[ErrorBoundary] Original error:', error, errorInfo);
      }
    } else {
      // Fallback: Sentry not initialized, log to console
      // This can happen during initial load before SDK is ready
      console.error(
        '[ErrorBoundary] Sentry not initialized, logging error:',
        error,
        errorInfo
      );
    }
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className='flex flex-col items-center justify-center min-h-[200px] p-6 text-center'>
          <div
            className='w-full max-w-md rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'
            role='alert'
            aria-live='polite'
          >
            <div className='space-y-4'>
              <div className='flex justify-center'>
                <div className='text-destructive'>
                  <svg
                    className='h-12 w-12'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                    aria-hidden='true'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
                    />
                  </svg>
                </div>
              </div>

              <div className='space-y-2'>
                <h3 className='heading-linear text-lg text-primary-token'>
                  Something went wrong
                </h3>
                <p className='text-linear text-sm text-secondary-token'>
                  We encountered an unexpected error. Please try refreshing the
                  page.
                </p>
              </div>

              <div className='flex justify-center'>
                <button
                  type='button'
                  onClick={() => window.location.reload()}
                  className='btn btn-md btn-primary btn-press'
                >
                  Reload page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error handler for functional components.
 *
 * Works with both lite and full Sentry SDK modes:
 * - Checks if Sentry is initialized before capturing
 * - Includes SDK mode information in error context
 * - Provides fallback logging if Sentry is unavailable
 *
 * @example
 * const { handleError, sentryMode, isSentryReady } = useErrorHandler();
 *
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   handleError(error as Error);
 * }
 */
export const useErrorHandler = () => {
  const handleError = React.useCallback(
    (error: Error, errorInfo?: ErrorInfo) => {
      const sentryMode = getSentryMode();
      const isInitialized = isSentryInitialized();

      // Capture error in Sentry if SDK is initialized (works with both lite and full modes)
      if (isInitialized) {
        try {
          Sentry.captureException(error, {
            extra: {
              componentStack: errorInfo?.componentStack,
              sentryMode,
            },
            tags: {
              errorHandler: 'useErrorHandler',
              sentryMode,
            },
          });
        } catch (sentryError) {
          // Fallback: Sentry capture failed
          console.error(
            '[useErrorHandler] Sentry capture failed:',
            sentryError
          );
          console.error('[useErrorHandler] Original error:', error, errorInfo);
        }
      } else {
        // Fallback: Sentry not initialized
        console.error(
          '[useErrorHandler] Sentry not initialized, logging error:',
          error,
          errorInfo
        );
      }

      // Show toast for user-facing errors
      const isUserFacing = (() => {
        if (typeof error === 'string') return true;
        if (error instanceof Error) {
          const technicalErrors = [
            'Network request failed',
            'TypeError',
            'ReferenceError',
            'SyntaxError',
          ];
          return !technicalErrors.some(techError =>
            error.message.includes(techError)
          );
        }
        return false;
      })();

      if (isUserFacing) {
        const message = (() => {
          if (typeof error === 'string') return error;
          if (error instanceof Error) {
            if (error.message.includes('fetch')) {
              return 'Network error. Please check your connection.';
            }
            if (error.message.includes('rate limit')) {
              return 'Too many requests. Please wait a moment.';
            }
            if (error.message.length < 100 && !error.message.includes('at ')) {
              return error.message;
            }
          }
          return 'Something went wrong. Please try again.';
        })();
        toast.error(message, { duration: 6000 });
      }
    },
    []
  );

  // Provide additional state for consumers that need to check SDK status
  const sentryMode = React.useMemo(() => getSentryMode(), []);
  const isSentryReady = React.useMemo(() => isSentryInitialized(), []);

  return { handleError, sentryMode, isSentryReady };
};

/**
 * Higher-order component that wraps a component with error boundary
 */
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
};
