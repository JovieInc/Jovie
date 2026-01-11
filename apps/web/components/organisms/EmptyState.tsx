'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

type EmptyStateVariant = 'default' | 'search' | 'error' | 'permission';

type PrimaryAction =
  | {
      label: string;
      onClick: () => void;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
    }
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
    };

type SecondaryAction =
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
    }
  | {
      label: string;
      onClick: () => void;
      ariaLabel?: string;
    };

export interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  description?: string;
  action?: PrimaryAction;
  secondaryAction?: SecondaryAction;
  variant?: EmptyStateVariant;
  className?: string;
  testId?: string;
}

const variantStyles: Record<
  EmptyStateVariant,
  {
    iconWrapper: string;
    heading: string;
    description: string;
    secondary: string;
  }
> = {
  default: {
    iconWrapper:
      'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200 dark:bg-gray-900/60 dark:text-gray-400 dark:ring-gray-800',
    heading: 'text-gray-900 dark:text-gray-100',
    description: 'text-gray-600 dark:text-gray-400',
    secondary: 'text-indigo-600 dark:text-indigo-400',
  },
  search: {
    iconWrapper:
      'bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900/60',
    heading: 'text-sky-800 dark:text-sky-200',
    description: 'text-sky-700 dark:text-sky-300/90',
    secondary: 'text-sky-600 dark:text-sky-300',
  },
  error: {
    iconWrapper:
      'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50',
    heading: 'text-rose-700 dark:text-rose-200',
    description: 'text-rose-600 dark:text-rose-300/90',
    secondary: 'text-rose-600 dark:text-rose-300',
  },
  permission: {
    iconWrapper:
      'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
    heading: 'text-amber-800 dark:text-amber-200',
    description: 'text-amber-700 dark:text-amber-300/90',
    secondary: 'text-amber-700 dark:text-amber-300',
  },
};

export function EmptyState({
  icon,
  heading,
  description,
  action,
  secondaryAction,
  variant = 'default',
  className,
  testId,
}: EmptyStateProps) {
  const headingId = React.useId();
  const descriptionId = React.useId();
  const styles = variantStyles[variant] ?? variantStyles.default;

  const renderPrimaryAction = (): React.ReactNode => {
    if (!action) return null;

    if ('href' in action) {
      return (
        <Button
          asChild
          variant={action.variant ?? 'primary'}
          className='mt-2 w-full max-w-xs sm:w-auto'
        >
          <Link
            href={action.href}
            target={action.target}
            rel={action.rel}
            aria-label={action.ariaLabel ?? action.label}
          >
            {action.label}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        variant={action.variant ?? 'primary'}
        onClick={action.onClick}
        aria-label={action.ariaLabel ?? action.label}
        className='mt-2 w-full max-w-xs sm:w-auto'
      >
        {action.label}
      </Button>
    );
  };

  const renderSecondaryAction = (): React.ReactNode => {
    if (!secondaryAction) return null;

    if ('href' in secondaryAction) {
      return (
        <Link
          href={secondaryAction.href}
          target={secondaryAction.target}
          rel={secondaryAction.rel}
          className={cn(
            'mt-4 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
            styles.secondary
          )}
        >
          {secondaryAction.label}
        </Link>
      );
    }

    return (
      <button
        type='button'
        onClick={secondaryAction.onClick}
        aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
        className={cn(
          'mt-4 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
          styles.secondary
        )}
      >
        {secondaryAction.label}
      </button>
    );
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: status role needed for accessible empty state announcement
    <section
      role='status'
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center px-4 py-12 text-center min-h-[400px]',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-4 flex h-12 w-12 items-center justify-center rounded-full',
            styles.iconWrapper
          )}
          aria-hidden='true'
        >
          <span className='flex h-8 w-8 items-center justify-center'>
            {icon}
          </span>
        </div>
      )}

      <h3
        id={headingId}
        className={cn('mb-2 text-lg font-semibold', styles.heading)}
      >
        {heading}
      </h3>

      {description && (
        <p
          id={descriptionId}
          className={cn('mb-6 max-w-sm text-sm', styles.description)}
        >
          {description}
        </p>
      )}

      {renderPrimaryAction()}
      {renderSecondaryAction()}
    </section>
  );
}
