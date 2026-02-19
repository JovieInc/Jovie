'use client';

import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Generate a short reference ID for errors without a Next.js digest.
 * Uses timestamp + random hex to create a unique, human-readable reference.
 */
function generateErrorRef(): string {
  const ts = Date.now().toString(36).slice(-4);
  const rand = Math.random().toString(36).slice(2, 6);
  return `ref-${ts}-${rand}`;
}

/**
 * Build a copyable error details string.
 */
export function buildErrorDetails(
  error: (Error & { digest?: string }) | undefined,
  timestamp: Date,
  extra?: Record<string, string>,
  errorRef?: string
): string {
  const id = error?.digest || errorRef || generateErrorRef();
  const lines = [
    `Error ID: ${id}`,
    `Message: ${error?.message || 'Unknown error'}`,
    `Time: ${timestamp.toISOString()}`,
    ...Object.entries(extra ?? {}).map(([k, v]) => `${k}: ${v}`),
    `URL: ${globalThis.location?.href ?? 'N/A'}`,
    `User Agent: ${globalThis.navigator?.userAgent ?? 'N/A'}`,
  ];
  return lines.join('\n');
}

interface ErrorDetailsProps {
  readonly error?: Error & { digest?: string };
  readonly extraContext?: Record<string, string>;
}

/**
 * Shared error details section: error ID, timestamp, copy button, and dev info.
 * Used across PageErrorState, ErrorDialog, DashboardErrorFallback, and ErrorBoundary
 * to eliminate copy-pasted code.
 */
export function ErrorDetails({ error, extraContext }: ErrorDetailsProps) {
  const [timestamp] = useState(() => new Date());
  const [errorRef] = useState(() =>
    error?.digest ? undefined : generateErrorRef()
  );
  const displayId = error?.digest || errorRef;

  const handleCopy = () => {
    const details = buildErrorDetails(error, timestamp, extraContext, errorRef);
    if (!navigator?.clipboard) {
      toast.error('Clipboard not available');
      return;
    }
    navigator.clipboard
      .writeText(details)
      .then(() => {
        toast.success('Error details copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy error details');
      });
  };

  return (
    <>
      <div className='space-y-2 border-t border-subtle pt-4'>
        {displayId && (
          <p className='text-xs text-muted-foreground text-center'>
            Error ID: {displayId}
          </p>
        )}
        <p className='text-xs text-muted-foreground text-center'>
          Occurred at: {timestamp.toLocaleString()}
        </p>

        <div className='flex justify-center'>
          <button
            type='button'
            onClick={handleCopy}
            className='inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors'
            aria-label='Copy error details to clipboard'
          >
            <Copy className='h-4 w-4' aria-hidden='true' />
            Copy Error Details
          </button>
        </div>
      </div>

      {process.env.NODE_ENV === 'development' && error?.message && (
        <details className='mt-4 rounded-md bg-surface-2 p-3'>
          <summary className='cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground'>
            Developer Info (dev only)
          </summary>
          <pre className='mt-2 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap break-words'>
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        </details>
      )}
    </>
  );
}
