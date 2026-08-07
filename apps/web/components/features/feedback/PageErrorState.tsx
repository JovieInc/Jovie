'use client';

import { Button } from '@jovie/ui';
import { ErrorDetails } from './ErrorDetails';
import { RECOVERY_COPY } from './recovery-contract';

interface PageErrorStateProps {
  readonly title?: string;
  readonly message: string;
  readonly error?: Error & { digest?: string };
  /** Label for the primary action button (default: "Try again") */
  readonly actionLabel?: string;
  /** Custom handler for the primary action (default: reload page) */
  readonly onRetry?: () => void;
  /** Extra context passed to ErrorDetails (e.g., { Context: 'Dashboard' }) */
  readonly extraContext?: Record<string, string>;
}

/**
 * Canonical error state component for pages, sections, and error boundaries.
 * Keeps recovery focused on one retry action, with diagnostic information disclosed on demand.
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
  title = RECOVERY_COPY.title,
  message,
  error,
  actionLabel = RECOVERY_COPY.retryLabel,
  onRetry,
  extraContext,
}: PageErrorStateProps) {
  const mergedContext = {
    Title: title,
    Message: message,
    ...extraContext,
  };

  return (
    <div
      className='flex min-h-64 flex-1 flex-col items-center justify-center px-4 py-10 text-center'
      role='alert'
      aria-live='polite'
    >
      <div className='w-full max-w-sm space-y-3'>
        <div className='space-y-1'>
          <h1 className='text-app font-medium text-primary-token'>{title}</h1>
          <p className='text-app text-tertiary-token'>{message}</p>
        </div>

        <div className='flex justify-center'>
          <Button
            variant='primary'
            size='sm'
            onClick={onRetry ?? (() => globalThis.location.reload())}
          >
            {actionLabel}
          </Button>
        </div>

        <ErrorDetails
          error={error}
          extraContext={mergedContext}
          collapsible={true}
          showMessage={Boolean(error?.message && error.message !== message)}
        />
      </div>
    </div>
  );
}
