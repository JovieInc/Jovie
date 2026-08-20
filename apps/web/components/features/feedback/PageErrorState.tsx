'use client';

import { EmptyState } from '@/components/molecules/EmptyState';
import { ErrorDetails } from './ErrorDetails';
import { RECOVERY_COPY } from './recovery-contract';

interface PageErrorStateProps {
  readonly title?: string;
  readonly message: string;
  readonly error?: Error & { digest?: string };
  /** Label for the primary action button (default: "Try again") */
  readonly actionLabel?: string;
  /** Accessible label when it needs more context than the visible action copy. */
  readonly actionAriaLabel?: string;
  /** Custom handler for the primary action (default: reload page) */
  readonly onRetry?: () => void;
  /** Extra context passed to ErrorDetails (e.g., { Context: 'Dashboard' }) */
  readonly extraContext?: Record<string, string>;
}

/**
 * Route-scaffold adapter for the canonical EmptyState error anatomy.
 * The surrounding route keeps ownership of its PageShell, table, or ambient
 * workspace plane; this component only owns recovery hierarchy and diagnostics.
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
  actionAriaLabel,
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
      data-content-state='error'
      data-testid='page-error-state'
    >
      <div className='flex w-full max-w-md flex-col items-center gap-3'>
        <EmptyState
          heading={title}
          description={message}
          variant='error'
          presentation='workspace'
          headingAs='h1'
          className='w-full flex-none px-0 py-0'
          action={{
            label: actionLabel,
            ariaLabel: actionAriaLabel,
            onClick: onRetry ?? (() => globalThis.location.reload()),
          }}
        />
        <div className='w-full max-w-sm'>
          <ErrorDetails
            error={error}
            extraContext={mergedContext}
            collapsible={true}
            showMessage={Boolean(error?.message && error.message !== message)}
          />
        </div>
      </div>
    </div>
  );
}
