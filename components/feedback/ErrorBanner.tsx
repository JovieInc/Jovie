import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import React from 'react';
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
}

export function ErrorBanner({
  title,
  description,
  actions = [],
  className,
  testId,
}: ErrorBannerProps) {
  const renderAction = (action: ErrorBannerAction, index: number) => {
    if (action.href) {
      const isInternal = action.href.startsWith('/');

      if (isInternal && !action.onClick) {
        return (
          <Link
            key={`${action.label}-${index}`}
            href={action.href}
            className='inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 dark:bg-red-800/30 dark:text-red-50 dark:ring-red-700 dark:hover:bg-red-800/50'
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
          className='inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 dark:bg-red-800/30 dark:text-red-50 dark:ring-red-700 dark:hover:bg-red-800/50'
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
        className='inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 dark:bg-red-800/30 dark:text-red-50 dark:ring-red-700 dark:hover:bg-red-800/50'
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
        'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900 shadow-sm dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-50',
        className
      )}
    >
      <div className='flex gap-3'>
        <span className='mt-1 flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'>
          <ExclamationTriangleIcon className='h-5 w-5' aria-hidden='true' />
        </span>

        <div className='flex-1 space-y-1'>
          <p className='text-sm font-semibold leading-tight'>{title}</p>
          {description ? (
            <p className='text-sm text-red-800 dark:text-red-100/80'>
              {description}
            </p>
          ) : null}

          {actions.length > 0 ? (
            <div className='mt-2 flex flex-wrap gap-2'>
              {actions.map(renderAction)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
