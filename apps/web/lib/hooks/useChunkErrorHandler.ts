'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { fetchBuildInfo } from './useVersionMonitor';

const TOAST_ID = 'chunk-error';

const CHUNK_ERROR_PATTERNS = [
  'loading chunk',
  'chunkloaderror',
  'loading css chunk',
  "couldn't find required dependency",
  'failed to fetch dynamically imported module',
] as const;

/**
 * ReferenceError patterns that occur during deployment transitions.
 * When users have stale JavaScript after a new deployment, modules may
 * fail to resolve properly, causing these errors.
 */
const DEPLOYMENT_REFERENCE_ERRORS = [
  'dynamic is not defined',
  'usestate is not defined',
  'useversionmonitor is not defined',
  'mystatsigenabled is not defined',
  'checkversionmismatch is not defined',
  'frequent_cache is not defined',
] as const;

/**
 * Checks if an error is a chunk load error (common when app is updated
 * while user has old version open)
 */
function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  return CHUNK_ERROR_PATTERNS.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Checks if an error is a deployment transition ReferenceError.
 * These occur when users have stale JavaScript that references
 * modules or exports that no longer exist after a deployment.
 */
function isDeploymentReferenceError(error: unknown): boolean {
  if (!error) return false;

  const isReferenceError =
    error instanceof ReferenceError ||
    (error instanceof Error && error.name === 'ReferenceError');

  if (!isReferenceError) return false;

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  return DEPLOYMENT_REFERENCE_ERRORS.some(pattern =>
    lowerMessage.includes(pattern)
  );
}

/**
 * Hook that catches chunk load errors and shows a user-friendly
 * notification prompting refresh.
 *
 * Chunk load errors commonly occur when:
 * - A new deployment changes chunk hashes
 * - User has old JS trying to load chunks that no longer exist
 * - Network issues during dynamic imports
 *
 * This hook:
 * - Listens for global error events
 * - Detects chunk load error patterns
 * - Verifies if a version mismatch caused the error
 * - Shows toast with refresh action
 * - Reports to Sentry with appropriate tags
 */
export function useChunkErrorHandler() {
  const hasShownNotification = useRef(false);

  useEffect(() => {
    const handleError = async (event: ErrorEvent) => {
      const error = event.error;
      const isChunkError = isChunkLoadError(error);
      const isDeploymentError = isDeploymentReferenceError(error);

      if (!isChunkError && !isDeploymentError) {
        return;
      }

      // Prevent default error handling for these errors
      event.preventDefault();

      // Only report chunk load errors to Sentry (deployment reference errors are filtered in beforeSend)
      if (isChunkError) {
        Sentry.captureException(error, {
          tags: {
            errorType: 'chunk_load_error',
            context: 'chunk_error_handler',
          },
          extra: {
            message: error instanceof Error ? error.message : String(error),
            url: window.location.href,
          },
        });
      }

      // Only show notification once per session
      if (hasShownNotification.current) {
        return;
      }

      // Check if this is due to a version mismatch
      const buildInfo = await fetchBuildInfo({ signal: undefined });
      const hasVersionInfo = buildInfo && buildInfo.buildId !== 'unknown';

      hasShownNotification.current = true;

      toast.warning(
        hasVersionInfo
          ? 'The app has been updated'
          : 'Something went wrong loading the app',
        {
          id: TOAST_ID,
          duration: Infinity,
          description: 'Please refresh to continue.',
          action: {
            label: 'Refresh',
            onClick: () => {
              window.location.reload();
            },
          },
        }
      );
    };

    // Handle unhandled promise rejections (dynamic imports throw these)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        isChunkLoadError(event.reason) ||
        isDeploymentReferenceError(event.reason)
      ) {
        // Convert to error event format and handle
        handleError({
          error: event.reason,
          preventDefault: () => event.preventDefault(),
        } as ErrorEvent);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection
      );
    };
  }, []);
}
