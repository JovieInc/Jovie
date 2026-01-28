import { AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface ErrorBannerAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface ErrorBannerProps {
  title: string;
  description?: string;
  actions?: ErrorBannerAction[];
  className?: string;
  testId?: string;
  /** Optional callback to dismiss the banner. When provided, renders a close button. */
  onDismiss?: () => void;
}

export function ErrorBanner({
  title,
  description,
  actions = [],
  className,
  testId,
  onDismiss,
}: ErrorBannerProps) {
  const renderAction = (action: ErrorBannerAction, index: number) => {
    if (action.href) {
      const isInternal = action.href.startsWith('/');

      if (isInternal && !action.onClick) {
        return (
          <Link
            key={`${action.label}-${index}`}
            href={action.href}
            className='inline-flex w-full items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-900 shadow-sm transition hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 dark:border-red-400/40 dark:bg-red-900/40 dark:text-red-50 dark:hover:bg-red-900/60 sm:w-auto'
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
          className='inline-flex w-full items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-900 shadow-sm transition hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 dark:border-red-400/40 dark:bg-red-900/40 dark:text-red-50 dark:hover:bg-red-900/60 sm:w-auto'
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
        className='inline-flex w-full items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-900 shadow-sm transition hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 dark:border-red-400/40 dark:bg-red-900/40 dark:text-red-50 dark:hover:bg-red-900/60 sm:w-auto'
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
        'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-red-900 shadow-sm dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-50',
        className
      )}
    >
      <div className='flex gap-3'>
        <span className='mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-700 dark:bg-red-900/60 dark:text-red-200'>
          <AlertTriangle className='h-5 w-5' aria-hidden='true' />
        </span>

        <div className='flex-1 min-w-0 space-y-1'>
          <p className='text-sm font-semibold leading-snug wrap-break-word'>
            {title}
          </p>
          {description ? (
            <p className='text-sm leading-snug text-red-800 dark:text-red-100/80'>
              {description}
            </p>
          ) : null}

          {actions.length > 0 ? (
            <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
              {actions.map((action, index) => renderAction(action, index))}
            </div>
          ) : null}
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
