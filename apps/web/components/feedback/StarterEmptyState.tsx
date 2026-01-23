import { Rocket, Sparkles } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface StarterEmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary';
}

export interface StarterEmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  primaryAction?: StarterEmptyStateAction;
  secondaryAction?: StarterEmptyStateAction;
  className?: string;
  testId?: string;
}

export function StarterEmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  className,
  testId,
}: StarterEmptyStateProps) {
  const renderAction = (
    action: StarterEmptyStateAction,
    isPrimary: boolean
  ) => {
    const variant = action.variant ?? (isPrimary ? 'primary' : 'secondary');
    const baseClasses =
      'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

    if (action.href) {
      const isInternal = action.href.startsWith('/');

      if (isInternal && !action.onClick) {
        return (
          <Link
            key={`${action.label}-${action.href}`}
            href={action.href}
            className={cn(
              baseClasses,
              variant === 'primary'
                ? 'bg-black text-white hover:bg-zinc-900 focus-visible:ring-zinc-900 dark:bg-white dark:text-black'
                : 'border border-subtle bg-white text-zinc-800 hover:bg-zinc-50 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800'
            )}
          >
            {action.label}
          </Link>
        );
      }

      return (
        <a
          key={`${action.label}-${action.href}`}
          href={action.href}
          onClick={action.onClick}
          className={cn(
            baseClasses,
            variant === 'primary'
              ? 'bg-black text-white hover:bg-zinc-900 focus-visible:ring-zinc-900 dark:bg-white dark:text-black'
              : 'border border-subtle bg-white text-zinc-800 hover:bg-zinc-50 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800'
          )}
        >
          {action.label}
        </a>
      );
    }

    return (
      <button
        key={action.label}
        type='button'
        onClick={action.onClick}
        className={cn(
          baseClasses,
          variant === 'primary'
            ? 'bg-black text-white hover:bg-zinc-900 focus-visible:ring-zinc-900 dark:bg-white dark:text-black'
            : 'border border-subtle bg-white text-zinc-800 hover:bg-zinc-50 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800'
        )}
      >
        {action.label}
      </button>
    );
  };

  return (
    // NOSONAR S6819: role="status" is correct for state announcements; <output> is for form calculation results
    <div
      role='status'
      aria-live='polite'
      data-testid={testId ?? 'app-empty-state'}
      className={cn(
        'rounded-2xl border border-dashed border-subtle bg-surface-1 p-6 shadow-sm dark:border-zinc-800',
        className
      )}
    >
      <div className='flex items-start gap-4'>
        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-white text-zinc-900 shadow-sm ring-1 ring-subtle dark:bg-zinc-900 dark:text-white'>
          {icon ?? <Sparkles className='h-6 w-6' aria-hidden='true' />}
        </div>
        <div className='flex-1 space-y-2'>
          <div>
            <p className='text-base font-semibold text-primary-token'>
              {title}
            </p>
            <p className='text-sm text-secondary-token'>{description}</p>
          </div>

          {(primaryAction || secondaryAction) && (
            <div className='flex flex-wrap gap-2'>
              {primaryAction ? renderAction(primaryAction, true) : null}
              {secondaryAction ? renderAction(secondaryAction, false) : null}
            </div>
          )}
        </div>

        <Rocket className='hidden h-10 w-10 text-accent-token sm:block' />
      </div>
    </div>
  );
}
