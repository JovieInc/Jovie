'use client';

import { useEffect } from 'react';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';
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
  message = "We couldn't load this page. Give it another try.",
}: ErrorBoundaryProps) {
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
    <PageErrorState
      title={isSkewError ? 'App updated' : RECOVERY_COPY.title}
      message={displayMessage}
      error={isSkewError ? undefined : error}
      onRetry={isSkewError ? () => globalThis.location.reload() : reset}
      extraContext={{ Context: context }}
    />
  );
}
