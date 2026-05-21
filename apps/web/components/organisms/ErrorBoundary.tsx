'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorDetails } from '@/features/feedback/ErrorDetails';
import { captureErrorInSentry } from '@/lib/errors/capture';

interface ErrorBoundaryProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
  readonly context: string;
  readonly message?: string;
}

/**
 * Returns true when the error is a deployment-skew server action mismatch.
 *
 * Next.js throws `UnrecognizedActionError` (client) or a plain `Error` with
 * a specific message (server) when a stale client bundle calls a server action
 * that no longer exists in the current deployment. Retrying with the same
 * stale bundle always fails — the correct recovery is a hard page reload.
 */
function isDeploymentSkewError(error: Error): boolean {
  const type = error.constructor?.name?.toLowerCase() ?? '';
  const msg = error.message?.toLowerCase() ?? '';
  return (
    type === 'unrecognizedactionerror' ||
    msg.includes('was not found on the server') ||
    msg.includes('failed to find server action')
  );
}

export default function ErrorBoundary({
  error,
  reset,
  context,
  message = "We couldn't load this page. Give it another try, or head home.",
}: ErrorBoundaryProps) {
  const router = useRouter();
  const isSkewError = isDeploymentSkewError(error);

  useEffect(() => {
    console.error(`[${context} Error]`, error);
    // Deployment-skew errors are filtered in Sentry's beforeSend — skip capture.
    if (!isSkewError) {
      captureErrorInSentry(error, context.toLowerCase(), {
        digest: error.digest,
      });
    }
  }, [error, context, isSkewError]);

  const displayMessage = isSkewError
    ? 'The app was just updated. Reload to continue.'
    : message;

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
          <h3 className='text-sm font-medium text-secondary-token'>
            {isSkewError ? 'App Updated' : 'Something went wrong'}
          </h3>
          <p className='text-app text-tertiary-token'>{displayMessage}</p>
        </div>

        <div className='flex justify-center gap-3'>
          {isSkewError ? (
            <Button
              variant='primary'
              size='sm'
              onClick={() => globalThis.location.reload()}
            >
              Reload
            </Button>
          ) : (
            <Button variant='primary' size='sm' onClick={reset}>
              Try again
            </Button>
          )}
          <Button variant='outline' size='sm' onClick={() => router.push('/')}>
            Go home
          </Button>
        </div>

        {!isSkewError && (
          <ErrorDetails error={error} extraContext={{ Context: context }} />
        )}
      </div>
    </div>
  );
}
