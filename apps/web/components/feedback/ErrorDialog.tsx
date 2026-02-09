'use client';

import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { ErrorBanner } from './ErrorBanner';

export interface ErrorDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly primaryActionLabel?: string;
  readonly onPrimaryAction?: () => void;
  readonly secondaryActionLabel?: string;
  readonly onSecondaryAction?: () => void;
  readonly error?: Error & { digest?: string };
}

export function ErrorDialog({
  open,
  title,
  description,
  onClose,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  error,
}: ErrorDialogProps) {
  const [timestamp] = useState(() => new Date());

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${error?.digest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Title: ${title}`,
      `Description: ${description}`,
      `URL: ${globalThis.location?.href ?? 'N/A'}`,
      `User Agent: ${globalThis.navigator?.userAgent ?? 'N/A'}`,
    ].join('\n');

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
    <Dialog
      open={open}
      onClose={onClose}
      className='bg-white p-6 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
    >
      <div className='space-y-4' data-testid='app-error-dialog'>
        <ErrorBanner title={title} description={description} />
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogBody>
          <p className='text-sm text-zinc-600 dark:text-zinc-300'>
            Something went wrong while processing your request. You can retry
            the last action or close this dialog to continue where you left off.
          </p>

          <div className='mt-4 pt-4 border-t border-subtle space-y-2'>
            {error?.digest && (
              <p className='text-xs text-zinc-500 dark:text-zinc-400'>
                Error ID: {error.digest}
              </p>
            )}
            <p className='text-xs text-zinc-500 dark:text-zinc-400'>
              Occurred at: {timestamp.toLocaleString()}
            </p>

            <button
              type='button'
              onClick={handleCopyErrorDetails}
              className='inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
              aria-label='Copy error details to clipboard'
            >
              <Copy className='h-3 w-3' aria-hidden='true' />
              Copy Error Details
            </button>
          </div>

          {process.env.NODE_ENV === 'development' && error?.message && (
            <details className='mt-4 rounded-md bg-zinc-100 dark:bg-zinc-800 p-3'>
              <summary className='cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'>
                Developer Info (dev only)
              </summary>
              <pre className='mt-2 overflow-auto text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words'>
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </details>
          )}
        </DialogBody>
        <DialogActions>
          {secondaryActionLabel ? (
            <button
              type='button'
              onClick={onSecondaryAction ?? onClose}
              className='inline-flex items-center justify-center rounded-md border border-subtle px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800'
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            type='button'
            onClick={onPrimaryAction ?? onClose}
            className='inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-900 dark:bg-white dark:text-black'
            data-testid='error-dialog-primary-action'
          >
            {primaryActionLabel ?? 'Retry'}
          </button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
