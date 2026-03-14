'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import { ErrorDetails } from './ErrorDetails';

interface PageErrorStateProps {
  readonly title?: string;
  readonly message: string;
  readonly error?: Error & { digest?: string };
  /** Label for the primary action button (default: "Refresh page") */
  readonly actionLabel?: string;
  /** Custom handler for the primary action (default: reload page) */
  readonly onRetry?: () => void;
  /** Optional secondary action */
  readonly secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Extra context passed to ErrorDetails (e.g., { Context: 'Dashboard' }) */
  readonly extraContext?: Record<string, string>;
}

/**
 * Canonical error state component for pages, sections, and error boundaries.
 * Shows a centered error message with retry/refresh actions and copyable error details.
 *
 * @example
 * // Server-side page error
 * <PageErrorState message="Failed to load data" error={error} />
 *
 * @example
 * // Error boundary fallback with retry
 * <PageErrorState
 *   title="Unable to load dashboard"
 *   message={error.message}
 *   error={error}
 *   actionLabel="Reload dashboard"
 *   onRetry={resetErrorBoundary}
 *   secondaryAction={{ label: 'Go home', onClick: () => router.push('/') }}
 *   extraContext={{ Context: 'Dashboard' }}
 * />
 */
export function PageErrorState({
  title = 'Something went wrong',
  message,
  error,
  actionLabel = 'Refresh page',
  onRetry,
  secondaryAction,
  extraContext,
}: PageErrorStateProps) {
  const mergedContext = {
    Title: title,
    Message: message,
    ...extraContext,
  };

  return (
    <div
      className='flex flex-1 flex-col items-center justify-center px-4 py-12 text-center'
      role='alert'
      aria-live='polite'
    >
      <div className='w-full max-w-sm space-y-4'>
        <div className='flex justify-center'>
          <div className='flex h-10 w-10 items-center justify-center text-destructive'>
            <AlertTriangle className='h-6 w-6' aria-hidden='true' />
          </div>
        </div>

        <div className='space-y-1.5'>
          <h1 className='text-sm font-medium text-secondary-token'>{title}</h1>
          <p className='text-[13px] text-tertiary-token'>{message}</p>
        </div>

        <div className='flex justify-center gap-3'>
          <Button
            variant='primary'
            size='sm'
            onClick={onRetry ?? (() => globalThis.location.reload())}
          >
            {actionLabel}
          </Button>
          {secondaryAction ? (
            <Button
              variant='outline'
              size='sm'
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>

        <ErrorDetails error={error} extraContext={mergedContext} />
      </div>
    </div>
  );
}
