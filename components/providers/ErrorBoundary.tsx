'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  createErrorToast,
  getUserFriendlyErrorMessage,
  isUserFacingError,
} from '@/lib/utils/toast-utils';

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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Show toast notification if enabled and error is user-facing
    if (this.props.showToast !== false && isUserFacingError(error)) {
      // We can't use hooks in class components, so we'll dispatch a custom event
      // that the ToastProvider can listen to
      const toastEvent = new CustomEvent('error-boundary-toast', {
        detail: createErrorToast(getUserFriendlyErrorMessage(error), {
          action: {
            label: 'Reload',
            onClick: () => window.location.reload(),
          },
        }),
      });
      window.dispatchEvent(toastEvent);
    }

    // Track error for monitoring (if you have error tracking)
    if (typeof window !== 'undefined' && 'gtag' in window) {
      // @ts-expect-error - gtag is not typed
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: false,
      });
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
          <div className='text-red-600 dark:text-red-400 mb-4'>
            <svg
              className='w-12 h-12 mx-auto'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
              />
            </svg>
          </div>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2'>
            Something went wrong
          </h3>
          <p className='text-gray-600 dark:text-gray-400 mb-4 max-w-md'>
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors'
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary for functional components
 * Use this when you need to handle errors in a specific component tree
 */
export const useErrorHandler = () => {
  const handleError = React.useCallback(
    (error: Error, errorInfo?: ErrorInfo) => {
      console.error('Error caught by useErrorHandler:', error, errorInfo);

      // Show toast for user-facing errors
      if (isUserFacingError(error)) {
        const toastEvent = new CustomEvent('error-boundary-toast', {
          detail: createErrorToast(getUserFriendlyErrorMessage(error)),
        });
        window.dispatchEvent(toastEvent);
      }
    },
    []
  );

  return { handleError };
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
