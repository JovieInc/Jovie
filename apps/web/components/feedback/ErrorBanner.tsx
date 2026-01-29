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
  const actionClass =
    'inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#150b0b] dark:focus-visible:ring-offset-[#0d0a0a]';

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
              'border border-red-500/50 bg-red-500/15 text-[#fce2e2] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] hover:bg-red-500/25 hover:border-red-400/70 dark:border-red-500/40 dark:bg-red-900/30 dark:hover:bg-red-900/45'
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
            'border border-red-500/50 bg-red-500/15 text-[#fce2e2] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] hover:bg-red-500/25 hover:border-red-400/70 dark:border-red-500/40 dark:bg-red-900/30 dark:hover:bg-red-900/45'
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
          'border border-red-500/50 bg-red-500/15 text-[#fce2e2] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] hover:bg-red-500/25 hover:border-red-400/70 dark:border-red-500/40 dark:bg-red-900/30 dark:hover:bg-red-900/45'
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
        'rounded-2xl border border-red-500/30 bg-[rgba(140,26,26,0.12)] px-5 py-4 text-[#f8e8e8] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.75)] backdrop-blur-sm dark:border-red-900/60 dark:bg-[rgba(70,12,12,0.45)] dark:text-red-50',
        className
      )}
    >
      <div className='flex gap-3'>
        <span className='mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-200 shadow-inner dark:border-red-700/60 dark:bg-red-900/40'>
          <AlertTriangle className='h-5 w-5' aria-hidden='true' />
        </span>

        <div className='flex-1 min-w-0 space-y-1.5'>
          <p className='text-sm font-semibold leading-snug tracking-tight wrap-break-word'>
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
