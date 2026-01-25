'use client';

import { Button, type ButtonProps, Kbd } from '@jovie/ui';
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
      /** Keyboard shortcut to display (e.g., "N then I" or "Ctrl+N") */
      shortcut?: string;
    }
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
      /** Keyboard shortcut to display (e.g., "N then I" or "Ctrl+N") */
      shortcut?: string;
    };

type SecondaryAction =
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      ariaLabel?: string;
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
  /** Button size - use 'sm' for less padding */
  size?: 'default' | 'sm';
  className?: string;
  testId?: string;
}

const variantStyles: Record<
  EmptyStateVariant,
  {
    iconWrapper: string;
    heading: string;
    description: string;
  }
> = {
  default: {
    iconWrapper:
      'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200 dark:bg-gray-900/60 dark:text-gray-400 dark:ring-gray-800',
    heading: 'text-primary-token',
    description: 'text-tertiary-token',
  },
  search: {
    iconWrapper:
      'bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900/60',
    heading: 'text-sky-800 dark:text-sky-200',
    description: 'text-sky-700/70 dark:text-sky-300/70',
  },
  error: {
    iconWrapper:
      'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50',
    heading: 'text-rose-700 dark:text-rose-200',
    description: 'text-rose-600/70 dark:text-rose-300/70',
  },
  permission: {
    iconWrapper:
      'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
    heading: 'text-amber-800 dark:text-amber-200',
    description: 'text-amber-700/70 dark:text-amber-300/70',
  },
};

/**
 * Parses a shortcut string like "N then I" or "Ctrl+N" into displayable parts
 */
function parseShortcut(shortcut: string): React.ReactNode {
  // Handle "X then Y" format
  if (shortcut.includes(' then ')) {
    const parts = shortcut.split(' then ');
    return (
      <span className='ml-2 inline-flex items-center gap-1'>
        <Kbd>{parts[0]}</Kbd>
        <span className='text-[10px] text-tertiary-token'>then</span>
        <Kbd>{parts[1]}</Kbd>
      </span>
    );
  }
  // Handle simple shortcut like "Ctrl+N"
  return (
    <span className='ml-2'>
      <Kbd>{shortcut}</Kbd>
    </span>
  );
}

export function EmptyState({
  icon,
  heading,
  description,
  action,
  secondaryAction,
  variant = 'default',
  size = 'default',
  className,
  testId,
}: EmptyStateProps) {
  const headingId = React.useId();
  const descriptionId = React.useId();
  const styles = variantStyles[variant] ?? variantStyles.default;
  const buttonSize = size === 'sm' ? 'sm' : 'default';

  const renderPrimaryAction = (): React.ReactNode => {
    if (!action) return null;

    const buttonContent = (
      <>
        {action.label}
        {action.shortcut && parseShortcut(action.shortcut)}
      </>
    );

    if ('href' in action) {
      return (
        <Button asChild variant={action.variant ?? 'primary'} size={buttonSize}>
          <Link
            href={action.href}
            target={action.target}
            rel={action.rel}
            aria-label={action.ariaLabel ?? action.label}
          >
            {buttonContent}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        variant={action.variant ?? 'primary'}
        size={buttonSize}
        onClick={action.onClick}
        aria-label={action.ariaLabel ?? action.label}
      >
        {buttonContent}
      </Button>
    );
  };

  const renderSecondaryAction = (): React.ReactNode => {
    if (!secondaryAction) return null;

    if ('href' in secondaryAction) {
      return (
        <Button asChild variant='outline' size={buttonSize}>
          <Link
            href={secondaryAction.href}
            target={secondaryAction.target}
            rel={secondaryAction.rel}
            aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
          >
            {secondaryAction.label}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        variant='outline'
        size={buttonSize}
        onClick={secondaryAction.onClick}
        aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
      >
        {secondaryAction.label}
      </Button>
    );
  };

  return (
    // NOSONAR S6819: role="status" is correct for state announcements; <output> is for form calculation results
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
        className={cn('mb-1 text-xl font-semibold', styles.heading)}
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

      {(action || secondaryAction) && (
        <div className='flex items-center gap-3'>
          {renderPrimaryAction()}
          {renderSecondaryAction()}
        </div>
      )}
    </section>
  );
}
