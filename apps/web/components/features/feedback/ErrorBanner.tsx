'use client';

import { AlertTriangle, Copy, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface ErrorBannerAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface ErrorBannerProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ErrorBannerAction[];
  readonly className?: string;
  readonly testId?: string;
  /** Optional callback to dismiss the banner. When provided, renders a close button. */
  readonly onDismiss?: () => void;
  /** Optional error object with digest */
  readonly error?: Error & { digest?: string };
}

export function ErrorBanner({
  title,
  description,
  actions = [],
  className,
  testId,
  onDismiss,
  error,
}: ErrorBannerProps) {
  const [timestamp] = useState(() => new Date());
  const [showDetails, setShowDetails] = useState(false);

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${error?.digest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Title: ${title}`,
      ...(description ? [`Description: ${description}`] : []),
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
  const actionClass =
    'inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-error-subtle';

  const renderAction = (action: ErrorBannerAction, index: number) => {
    if (action.href) {
      const isInternal = action.href.startsWith('/');

      if (isInternal && !action.onClick) {
        return (
          <Link
            key={`${action.label}-${index}`}
            href={action.href}
            className={cn(
              actionClass,
              'border border-error/50 bg-error/15 text-error-foreground shadow-lg hover:bg-error/25 hover:border-error/70'
            )}
          >
            {action.label}
          </Link>
        );
      }

      return (
        <a
          key={`${action.label}-${index}`}
          href={action.href}
          onClick={action.onClick}
          className={cn(
            actionClass,
            'border border-error/50 bg-error/15 text-error-foreground shadow-lg hover:bg-error/25 hover:border-error/70'
          )}
        >
          {action.label}
        </a>
      );
    }

    return (
      <button
        key={`${action.label}-${index}`}
        type='button'
        onClick={action.onClick}
        className={cn(
          actionClass,
          'border border-error/50 bg-error/15 text-error-foreground shadow-lg hover:bg-error/25 hover:border-error/70'
        )}
      >
        {action.label}
      </button>
    );
  };

  return (
    <div
      role='alert'
      aria-live='assertive'
      aria-label='Error'
      data-testid={testId ?? 'app-error-banner'}
      className={cn(
        'rounded-2xl border border-error/30 bg-error-subtle px-5 py-4 text-error-foreground shadow-xl backdrop-blur-sm dark:border-error/40',
        className
      )}
    >
      <div className='flex gap-3'>
        <span className='mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-200 shadow-inner dark:border-red-700/60 dark:bg-red-900/40'>
          <AlertTriangle className='h-5 w-5' aria-hidden='true' />
        </span>

        <div className='flex-1 min-w-0 space-y-1.5'>
          <p className='text-sm font-semibold leading-snug tracking-tight break-words'>
            {title}
          </p>
          {description ? (
            <p className='text-sm leading-snug text-red-100/90 dark:text-red-100/80'>
              {description}
            </p>
          ) : null}

          {actions.length > 0 ? (
            <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
              {actions.map((action, index) => renderAction(action, index))}
            </div>
          ) : null}

          <div className='mt-3'>
            <button
              type='button'
              onClick={() => setShowDetails(!showDetails)}
              className='text-xs text-red-100/70 hover:text-red-100 dark:text-red-200/70 dark:hover:text-red-200 underline decoration-dotted'
            >
              {showDetails ? 'Hide' : 'Show'} error details
            </button>

            {showDetails && (
              <div className='mt-2 pt-2 border-t border-red-500/20 dark:border-red-900/40 space-y-1.5'>
                {error?.digest && (
                  <p className='text-xs text-red-100/80 dark:text-red-200/70'>
                    Error ID: {error.digest}
                  </p>
                )}
                <p className='text-xs text-red-100/80 dark:text-red-200/70'>
                  Time: {timestamp.toLocaleString()}
                </p>

                <button
                  type='button'
                  onClick={handleCopyErrorDetails}
                  className='inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-100 hover:text-white hover:bg-red-500/20 transition-colors dark:text-red-200 dark:hover:text-red-50'
                  aria-label='Copy error details to clipboard'
                >
                  <Copy className='h-3 w-3' aria-hidden='true' />
                  Copy Error Details
                </button>

                {process.env.NODE_ENV === 'development' && error?.message && (
                  <details className='mt-2 rounded-md bg-red-900/30 dark:bg-red-950/50 p-2'>
                    <summary className='cursor-pointer text-xs font-medium text-red-100/90 dark:text-red-200/80 hover:text-red-50'>
                      Developer Info (dev only)
                    </summary>
                    <pre className='mt-2 overflow-auto text-xs text-red-100/80 dark:text-red-200/70 whitespace-pre-wrap break-words'>
                      {error.message}
                      {error.stack && `\n\n${error.stack}`}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>

        {onDismiss ? (
          <button
            type='button'
            onClick={onDismiss}
            aria-label='Dismiss error'
            className='mt-0.5 shrink-0 self-start rounded-full border border-red-500/30 bg-transparent p-1.5 text-red-700 transition-colors hover:bg-red-500/10 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-red-50 dark:border-red-800/50 dark:text-red-300 dark:hover:bg-red-900/40 dark:hover:text-red-100 dark:focus-visible:ring-offset-red-950'
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </button>
        ) : null}
      </div>
    </div>
  );
}
